import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { getLocale } from '../lib/i18n';
import { useOrg } from '../lib/OrgContext';

/* ── Interfaces ── */

interface TimeRecord {
    employee_id: string;
    employee_name?: string;
    date: string;
    clock_in: string | null;
    clock_out: string | null;
}

interface GpsSetting {
    id: string;
    user_id: string;
    employee_name?: string;
    store_name?: string;
    is_enabled: boolean;
    allowed_radius_m: number;
    allowed_lat: number | null;
    allowed_lng: number | null;
}

interface IpEntry {
    id: string;
    ip_address: string;
    label: string;
    store_id: string | null;
    store_name?: string;
    is_active: boolean;
}

interface AttendanceRule {
    id: string;
    store_id: string | null;
    store_name?: string;
    grace_period_minutes: number;
    early_clock_in_minutes: number;
    auto_clock_out_enabled: boolean;
    auto_clock_out_time: string | null;
    require_photo: boolean;
    require_gps: boolean;
    require_ip_check: boolean;
}

interface Store {
    id: string;
    name: string;
}

interface Employee {
    id: string;
    name: string;
    store_id: string | null;
}

/* ── Tabs ── */

type TabKey = 'import' | 'gps' | 'ip' | 'rules';

const TABS: { key: TabKey; zh: string; en: string; icon: string }[] = [
    { key: 'import', zh: '出勤紀錄匯入', en: 'Attendance Import', icon: '📥' },
    { key: 'gps', zh: 'GPS使用者管理', en: 'GPS User Management', icon: '📍' },
    { key: 'ip', zh: 'IP使用者管理', en: 'IP User Management', icon: '🌐' },
    { key: 'rules', zh: '打卡規則設定', en: 'Clock-in Rules', icon: '⚙️' },
];

/* ── Component ── */

export function AttendanceSettings() {
    const zh = getLocale() === 'zh-TW';
    const { orgId } = useOrg();
    const [tab, setTab] = useState<TabKey>('import');
    const [stores, setStores] = useState<Store[]>([]);
    const [employees, setEmployees] = useState<Employee[]>([]);

    useEffect(() => {
        if (!orgId) return;
        supabase.from('stores').select('id, name').eq('organization_id', orgId).order('name')
            .then(({ data }) => setStores(data || []));
        supabase.from('employees').select('id, name, store_id').eq('organization_id', orgId).order('name')
            .then(({ data }) => setEmployees(data || []));
    }, [orgId]);

    return (
        <div className="fade-in">
            <div className="page-header">
                <h1>🕐 {zh ? '出勤設定' : 'Attendance Settings'}</h1>
                <p className="page-subtitle">{zh ? '管理出勤匯入、GPS/IP打卡與打卡規則' : 'Manage attendance import, GPS/IP clock-in and rules'}</p>
            </div>

            <div className="tab-bar" style={{ marginBottom: '20px' }}>
                {TABS.map(t => (
                    <button key={t.key} className={`tab-item ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>
                        {t.icon} {zh ? t.zh : t.en}
                    </button>
                ))}
            </div>

            {tab === 'import' && <ImportTab zh={zh} orgId={orgId} employees={employees} />}
            {tab === 'gps' && <GpsTab zh={zh} orgId={orgId} stores={stores} employees={employees} />}
            {tab === 'ip' && <IpTab zh={zh} orgId={orgId} stores={stores} />}
            {tab === 'rules' && <RulesTab zh={zh} orgId={orgId} stores={stores} />}
        </div>
    );
}

/* ════════════════════════════════════════════
   Tab 1 — Attendance Import
   ════════════════════════════════════════════ */

function ImportTab({ zh, orgId, employees }: { zh: boolean; orgId: string; employees: Employee[] }) {
    const [csvRows, setCsvRows] = useState<string[][]>([]);
    const [headers, setHeaders] = useState<string[]>([]);
    const [mapping, setMapping] = useState<Record<string, number>>({ employee_id: 0, date: 1, clock_in: 2, clock_out: 3 });
    const [importing, setImporting] = useState(false);
    const [result, setResult] = useState<{ success: number; error: number } | null>(null);
    const [fileName, setFileName] = useState('');

    const parseCsv = (text: string) => {
        const lines = text.split(/\r?\n/).filter(l => l.trim());
        if (lines.length < 2) return;
        const hdr = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
        setHeaders(hdr);
        const rows = lines.slice(1).map(l => l.split(',').map(c => c.trim().replace(/^"|"$/g, '')));
        setCsvRows(rows);
        // auto-map by header name
        const autoMap: Record<string, number> = { employee_id: 0, date: 1, clock_in: 2, clock_out: 3 };
        hdr.forEach((h, i) => {
            const lower = h.toLowerCase();
            if (lower.includes('employee') || lower.includes('id') || lower === '員工編號') autoMap.employee_id = i;
            if (lower.includes('date') || lower === '日期') autoMap.date = i;
            if (lower.includes('clock_in') || lower.includes('上班') || lower === '簽到') autoMap.clock_in = i;
            if (lower.includes('clock_out') || lower.includes('下班') || lower === '簽退') autoMap.clock_out = i;
        });
        setMapping(autoMap);
        setResult(null);
    };

    const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setFileName(file.name);
        const reader = new FileReader();
        reader.onload = () => parseCsv(reader.result as string);
        reader.readAsText(file);
    };

    const doImport = async () => {
        setImporting(true);
        let success = 0;
        let error = 0;
        for (const row of csvRows) {
            const employeeId = row[mapping.employee_id]?.trim();
            const date = row[mapping.date]?.trim();
            const clockIn = row[mapping.clock_in]?.trim() || null;
            const clockOut = row[mapping.clock_out]?.trim() || null;
            if (!employeeId || !date) { error++; continue; }
            const { error: err } = await supabase.from('time_records').insert({
                organization_id: orgId,
                employee_id: employeeId,
                date,
                clock_in: clockIn,
                clock_out: clockOut,
                source: 'csv_import',
            });
            if (err) error++; else success++;
        }
        setResult({ success, error });
        setImporting(false);
    };

    const FIELDS = [
        { key: 'employee_id', label: zh ? '員工編號' : 'Employee ID' },
        { key: 'date', label: zh ? '日期' : 'Date' },
        { key: 'clock_in', label: zh ? '上班打卡' : 'Clock In' },
        { key: 'clock_out', label: zh ? '下班打卡' : 'Clock Out' },
    ];

    return (
        <>
            {/* Upload area */}
            <div className="card" style={{ marginBottom: '20px' }}>
                <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '12px' }}>
                    📂 {zh ? '上傳出勤檔案' : 'Upload Attendance File'}
                </h3>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                    {zh ? '支援 CSV 格式，第一行為欄位標題' : 'Supports CSV format. First row should be column headers.'}
                </p>
                <input type="file" accept=".csv,.txt" onChange={handleFile}
                    style={{ marginBottom: '8px' }} />
                {fileName && (
                    <span style={{ fontSize: '13px', color: 'var(--text-secondary)', marginLeft: '12px' }}>
                        📄 {fileName} — {csvRows.length} {zh ? '筆資料' : 'rows'}
                    </span>
                )}
            </div>

            {/* Column mapping */}
            {headers.length > 0 && (
                <div className="card" style={{ marginBottom: '20px' }}>
                    <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '12px' }}>
                        🔗 {zh ? '欄位對應' : 'Column Mapping'}
                    </h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px' }}>
                        {FIELDS.map(f => (
                            <div key={f.key}>
                                <label className="detail-label">{f.label}</label>
                                <select className="input-field" value={mapping[f.key] ?? 0}
                                    onChange={e => setMapping({ ...mapping, [f.key]: Number(e.target.value) })}>
                                    {headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
                                </select>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Preview table */}
            {csvRows.length > 0 && (
                <div className="card" style={{ marginBottom: '20px', overflowX: 'auto' }}>
                    <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '12px' }}>
                        👁 {zh ? '預覽（前 10 筆）' : 'Preview (first 10 rows)'}
                    </h3>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                        <thead>
                            <tr>
                                {FIELDS.map(f => (
                                    <th key={f.key} style={{ textAlign: 'left', padding: '8px', borderBottom: '2px solid var(--border-primary)', fontWeight: 600 }}>
                                        {f.label}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {csvRows.slice(0, 10).map((row, i) => (
                                <tr key={i}>
                                    {FIELDS.map(f => (
                                        <td key={f.key} style={{ padding: '8px', borderBottom: '1px solid var(--border-primary)' }}>
                                            {row[mapping[f.key]] || '-'}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    <div style={{ display: 'flex', gap: '12px', marginTop: '16px', alignItems: 'center' }}>
                        <button className="btn btn-primary" onClick={doImport} disabled={importing}>
                            {importing ? (zh ? '匯入中…' : 'Importing…') : `📥 ${zh ? '匯入' : 'Import'} ${csvRows.length} ${zh ? '筆' : 'rows'}`}
                        </button>
                        <button className="btn btn-secondary" onClick={() => { setCsvRows([]); setHeaders([]); setFileName(''); setResult(null); }}>
                            {zh ? '清除' : 'Clear'}
                        </button>
                    </div>
                </div>
            )}

            {/* Result */}
            {result && (
                <div className="card" style={{ marginBottom: '20px', borderLeft: `4px solid ${result.error > 0 ? 'var(--status-error)' : 'var(--status-success)'}` }}>
                    <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '8px' }}>
                        📊 {zh ? '匯入結果' : 'Import Results'}
                    </h3>
                    <p style={{ fontSize: '14px' }}>
                        ✅ {zh ? '成功' : 'Success'}: <strong>{result.success}</strong>
                        {result.error > 0 && (<> &nbsp;|&nbsp; ❌ {zh ? '失敗' : 'Error'}: <strong>{result.error}</strong></>)}
                    </p>
                </div>
            )}
        </>
    );
}

/* ════════════════════════════════════════════
   Tab 2 — GPS User Management
   ════════════════════════════════════════════ */

function GpsTab({ zh, orgId, stores, employees }: { zh: boolean; orgId: string; stores: Store[]; employees: Employee[] }) {
    const [settings, setSettings] = useState<GpsSetting[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [editId, setEditId] = useState<string | null>(null);
    const [form, setForm] = useState({ user_id: '', is_enabled: true, allowed_radius_m: '100', allowed_lat: '', allowed_lng: '' });

    const load = async () => {
        const { data } = await supabase.from('gps_settings').select('*').eq('org_id', orgId).order('created_at', { ascending: false });
        const rows = (data || []).map((r: any) => ({
            ...r,
            employee_name: employees.find(e => e.id === r.user_id)?.name || r.user_id,
            store_name: stores.find(s => s.id === employees.find(e => e.id === r.user_id)?.store_id)?.name || '-',
        }));
        setSettings(rows);
        setLoading(false);
    };

    useEffect(() => { if (orgId && employees.length >= 0) load(); }, [orgId, employees.length]);

    const save = async () => {
        if (!form.user_id) return;
        const payload = {
            org_id: orgId,
            user_id: form.user_id,
            is_enabled: form.is_enabled,
            allowed_radius_m: Number(form.allowed_radius_m) || 100,
            allowed_lat: form.allowed_lat ? Number(form.allowed_lat) : null,
            allowed_lng: form.allowed_lng ? Number(form.allowed_lng) : null,
        };
        if (editId) {
            await supabase.from('gps_settings').update(payload).eq('id', editId);
        } else {
            await supabase.from('gps_settings').insert(payload);
        }
        resetForm();
        await load();
    };

    const remove = async (id: string) => {
        if (!confirm(zh ? '確定刪除此 GPS 設定？' : 'Delete this GPS setting?')) return;
        await supabase.from('gps_settings').delete().eq('id', id);
        await load();
    };

    const startEdit = (s: GpsSetting) => {
        setEditId(s.id);
        setForm({
            user_id: s.user_id,
            is_enabled: s.is_enabled,
            allowed_radius_m: String(s.allowed_radius_m),
            allowed_lat: s.allowed_lat != null ? String(s.allowed_lat) : '',
            allowed_lng: s.allowed_lng != null ? String(s.allowed_lng) : '',
        });
        setShowForm(true);
    };

    const toggleEnabled = async (s: GpsSetting) => {
        await supabase.from('gps_settings').update({ is_enabled: !s.is_enabled }).eq('id', s.id);
        await load();
    };

    const resetForm = () => {
        setForm({ user_id: '', is_enabled: true, allowed_radius_m: '100', allowed_lat: '', allowed_lng: '' });
        setShowForm(false);
        setEditId(null);
    };

    return (
        <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                    📍 {settings.length} {zh ? '位員工已設定 GPS 打卡' : 'employees with GPS clock-in'}
                </span>
                <button className="btn btn-primary" onClick={() => { resetForm(); setShowForm(true); }}>
                    ➕ {zh ? '新增 GPS 設定' : 'Add GPS Setting'}
                </button>
            </div>

            {showForm && (
                <div className="card" style={{ marginBottom: '20px' }}>
                    <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '12px' }}>
                        {editId ? (zh ? '✏️ 編輯 GPS 設定' : '✏️ Edit GPS Setting') : (zh ? '➕ 新增 GPS 設定' : '➕ Add GPS Setting')}
                    </h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px' }}>
                        <div>
                            <label className="detail-label">{zh ? '員工' : 'Employee'} *</label>
                            <select className="input-field" value={form.user_id} onChange={e => setForm({ ...form, user_id: e.target.value })}>
                                <option value="">{zh ? '— 選擇員工 —' : '— Select —'}</option>
                                {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="detail-label">{zh ? '允許半徑 (公尺)' : 'Allowed Radius (m)'}</label>
                            <input className="input-field" type="number" value={form.allowed_radius_m}
                                onChange={e => setForm({ ...form, allowed_radius_m: e.target.value })} />
                        </div>
                        <div>
                            <label className="detail-label">{zh ? '中心緯度' : 'Center Lat'}</label>
                            <input className="input-field" type="number" step="0.000001" value={form.allowed_lat}
                                onChange={e => setForm({ ...form, allowed_lat: e.target.value })} placeholder="25.033964" />
                        </div>
                        <div>
                            <label className="detail-label">{zh ? '中心經度' : 'Center Lng'}</label>
                            <input className="input-field" type="number" step="0.000001" value={form.allowed_lng}
                                onChange={e => setForm({ ...form, allowed_lng: e.target.value })} placeholder="121.564468" />
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingTop: '22px' }}>
                            <input type="checkbox" id="gps-enabled" checked={form.is_enabled}
                                onChange={e => setForm({ ...form, is_enabled: e.target.checked })} />
                            <label htmlFor="gps-enabled" style={{ fontSize: '13px' }}>{zh ? '啟用' : 'Enabled'}</label>
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }}>
                        <button className="btn btn-primary" onClick={save}>{zh ? '儲存' : 'Save'}</button>
                        <button className="btn btn-secondary" onClick={resetForm}>{zh ? '取消' : 'Cancel'}</button>
                    </div>
                </div>
            )}

            {loading ? <p className="loading-pulse">{zh ? '載入中…' : 'Loading…'}</p> : (
                <div className="card" style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                        <thead>
                            <tr>
                                {[zh ? '員工' : 'Employee', zh ? '門市' : 'Store', zh ? '狀態' : 'Status',
                                  zh ? '半徑 (m)' : 'Radius (m)', zh ? '緯度' : 'Lat', zh ? '經度' : 'Lng', zh ? '操作' : 'Actions']
                                    .map(h => <th key={h} style={{ textAlign: 'left', padding: '10px 8px', borderBottom: '2px solid var(--border-primary)', fontWeight: 600 }}>{h}</th>)}
                            </tr>
                        </thead>
                        <tbody>
                            {settings.length === 0 ? (
                                <tr><td colSpan={7} style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>
                                    {zh ? '尚無 GPS 設定' : 'No GPS settings yet'}
                                </td></tr>
                            ) : settings.map(s => (
                                <tr key={s.id}>
                                    <td style={{ padding: '10px 8px', borderBottom: '1px solid var(--border-primary)' }}>{s.employee_name}</td>
                                    <td style={{ padding: '10px 8px', borderBottom: '1px solid var(--border-primary)' }}>{s.store_name}</td>
                                    <td style={{ padding: '10px 8px', borderBottom: '1px solid var(--border-primary)' }}>
                                        <button onClick={() => toggleEnabled(s)}
                                            style={{ background: s.is_enabled ? 'var(--status-success)' : 'var(--text-muted)', color: '#fff',
                                                border: 'none', borderRadius: '12px', padding: '2px 10px', fontSize: '12px', cursor: 'pointer' }}>
                                            {s.is_enabled ? (zh ? '啟用' : 'On') : (zh ? '停用' : 'Off')}
                                        </button>
                                    </td>
                                    <td style={{ padding: '10px 8px', borderBottom: '1px solid var(--border-primary)' }}>{s.allowed_radius_m}</td>
                                    <td style={{ padding: '10px 8px', borderBottom: '1px solid var(--border-primary)' }}>{s.allowed_lat ?? '-'}</td>
                                    <td style={{ padding: '10px 8px', borderBottom: '1px solid var(--border-primary)' }}>{s.allowed_lng ?? '-'}</td>
                                    <td style={{ padding: '10px 8px', borderBottom: '1px solid var(--border-primary)' }}>
                                        <button className="btn btn-secondary" style={{ marginRight: '6px', fontSize: '12px', padding: '4px 8px' }} onClick={() => startEdit(s)}>
                                            ✏️
                                        </button>
                                        <button className="btn btn-secondary" style={{ fontSize: '12px', padding: '4px 8px', color: 'var(--status-error)' }} onClick={() => remove(s.id)}>
                                            🗑
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </>
    );
}

/* ════════════════════════════════════════════
   Tab 3 — IP User Management
   ════════════════════════════════════════════ */

function IpTab({ zh, orgId, stores }: { zh: boolean; orgId: string; stores: Store[] }) {
    const [entries, setEntries] = useState<IpEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [editId, setEditId] = useState<string | null>(null);
    const [form, setForm] = useState({ ip_address: '', label: '', store_id: '', is_active: true });

    const load = async () => {
        const { data } = await supabase.from('ip_whitelist').select('*').eq('org_id', orgId).order('created_at', { ascending: false });
        const rows = (data || []).map((r: any) => ({
            ...r,
            store_name: stores.find(s => s.id === r.store_id)?.name || (zh ? '全部門市' : 'All stores'),
        }));
        setEntries(rows);
        setLoading(false);
    };

    useEffect(() => { if (orgId) load(); }, [orgId, stores.length]);

    const save = async () => {
        if (!form.ip_address) return;
        const payload = {
            org_id: orgId,
            ip_address: form.ip_address.trim(),
            label: form.label.trim() || null,
            store_id: form.store_id || null,
            is_active: form.is_active,
        };
        if (editId) {
            await supabase.from('ip_whitelist').update(payload).eq('id', editId);
        } else {
            await supabase.from('ip_whitelist').insert(payload);
        }
        resetForm();
        await load();
    };

    const remove = async (id: string) => {
        if (!confirm(zh ? '確定刪除此 IP？' : 'Delete this IP entry?')) return;
        await supabase.from('ip_whitelist').delete().eq('id', id);
        await load();
    };

    const startEdit = (e: IpEntry) => {
        setEditId(e.id);
        setForm({ ip_address: e.ip_address, label: e.label || '', store_id: e.store_id || '', is_active: e.is_active });
        setShowForm(true);
    };

    const toggleActive = async (e: IpEntry) => {
        await supabase.from('ip_whitelist').update({ is_active: !e.is_active }).eq('id', e.id);
        await load();
    };

    const resetForm = () => {
        setForm({ ip_address: '', label: '', store_id: '', is_active: true });
        setShowForm(false);
        setEditId(null);
    };

    return (
        <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                    🌐 {entries.length} {zh ? '組 IP 位址' : 'IP addresses'}
                </span>
                <button className="btn btn-primary" onClick={() => { resetForm(); setShowForm(true); }}>
                    ➕ {zh ? '新增 IP' : 'Add IP'}
                </button>
            </div>

            {showForm && (
                <div className="card" style={{ marginBottom: '20px' }}>
                    <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '12px' }}>
                        {editId ? (zh ? '✏️ 編輯 IP' : '✏️ Edit IP') : (zh ? '➕ 新增 IP' : '➕ Add IP')}
                    </h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px' }}>
                        <div>
                            <label className="detail-label">{zh ? 'IP 位址' : 'IP Address'} *</label>
                            <input className="input-field" value={form.ip_address} placeholder="192.168.1.0/24"
                                onChange={e => setForm({ ...form, ip_address: e.target.value })} />
                        </div>
                        <div>
                            <label className="detail-label">{zh ? '標籤/描述' : 'Label'}</label>
                            <input className="input-field" value={form.label} placeholder={zh ? '辦公室 Wi-Fi' : 'Office Wi-Fi'}
                                onChange={e => setForm({ ...form, label: e.target.value })} />
                        </div>
                        <div>
                            <label className="detail-label">{zh ? '門市' : 'Store'}</label>
                            <select className="input-field" value={form.store_id} onChange={e => setForm({ ...form, store_id: e.target.value })}>
                                <option value="">{zh ? '全部門市' : 'All Stores'}</option>
                                {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingTop: '22px' }}>
                            <input type="checkbox" id="ip-active" checked={form.is_active}
                                onChange={e => setForm({ ...form, is_active: e.target.checked })} />
                            <label htmlFor="ip-active" style={{ fontSize: '13px' }}>{zh ? '啟用' : 'Active'}</label>
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }}>
                        <button className="btn btn-primary" onClick={save}>{zh ? '儲存' : 'Save'}</button>
                        <button className="btn btn-secondary" onClick={resetForm}>{zh ? '取消' : 'Cancel'}</button>
                    </div>
                </div>
            )}

            {loading ? <p className="loading-pulse">{zh ? '載入中…' : 'Loading…'}</p> : (
                <div className="card" style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                        <thead>
                            <tr>
                                {[zh ? 'IP 位址' : 'IP Address', zh ? '標籤' : 'Label', zh ? '門市' : 'Store',
                                  zh ? '狀態' : 'Status', zh ? '操作' : 'Actions']
                                    .map(h => <th key={h} style={{ textAlign: 'left', padding: '10px 8px', borderBottom: '2px solid var(--border-primary)', fontWeight: 600 }}>{h}</th>)}
                            </tr>
                        </thead>
                        <tbody>
                            {entries.length === 0 ? (
                                <tr><td colSpan={5} style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>
                                    {zh ? '尚無 IP 設定' : 'No IP entries yet'}
                                </td></tr>
                            ) : entries.map(e => (
                                <tr key={e.id}>
                                    <td style={{ padding: '10px 8px', borderBottom: '1px solid var(--border-primary)', fontFamily: 'monospace' }}>{e.ip_address}</td>
                                    <td style={{ padding: '10px 8px', borderBottom: '1px solid var(--border-primary)' }}>{e.label || '-'}</td>
                                    <td style={{ padding: '10px 8px', borderBottom: '1px solid var(--border-primary)' }}>{e.store_name}</td>
                                    <td style={{ padding: '10px 8px', borderBottom: '1px solid var(--border-primary)' }}>
                                        <button onClick={() => toggleActive(e)}
                                            style={{ background: e.is_active ? 'var(--status-success)' : 'var(--text-muted)', color: '#fff',
                                                border: 'none', borderRadius: '12px', padding: '2px 10px', fontSize: '12px', cursor: 'pointer' }}>
                                            {e.is_active ? (zh ? '啟用' : 'Active') : (zh ? '停用' : 'Inactive')}
                                        </button>
                                    </td>
                                    <td style={{ padding: '10px 8px', borderBottom: '1px solid var(--border-primary)' }}>
                                        <button className="btn btn-secondary" style={{ marginRight: '6px', fontSize: '12px', padding: '4px 8px' }} onClick={() => startEdit(e)}>
                                            ✏️
                                        </button>
                                        <button className="btn btn-secondary" style={{ fontSize: '12px', padding: '4px 8px', color: 'var(--status-error)' }} onClick={() => remove(e.id)}>
                                            🗑
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </>
    );
}

/* ════════════════════════════════════════════
   Tab 4 — Clock-in Rules
   ════════════════════════════════════════════ */

function RulesTab({ zh, orgId, stores }: { zh: boolean; orgId: string; stores: Store[] }) {
    const [rules, setRules] = useState<AttendanceRule[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [editId, setEditId] = useState<string | null>(null);
    const [form, setForm] = useState({
        store_id: '',
        grace_period_minutes: '5',
        early_clock_in_minutes: '30',
        auto_clock_out_enabled: false,
        auto_clock_out_time: '22:00',
        require_photo: false,
        require_gps: false,
        require_ip_check: false,
    });

    const load = async () => {
        const { data } = await supabase.from('attendance_rules').select('*').eq('org_id', orgId).order('store_id', { ascending: true, nullsFirst: true });
        const rows = (data || []).map((r: any) => ({
            ...r,
            store_name: r.store_id ? (stores.find(s => s.id === r.store_id)?.name || r.store_id) : (zh ? '全域預設' : 'Global Default'),
        }));
        setRules(rows);
        setLoading(false);
    };

    useEffect(() => { if (orgId) load(); }, [orgId, stores.length]);

    const save = async () => {
        const payload = {
            org_id: orgId,
            store_id: form.store_id || null,
            grace_period_minutes: Number(form.grace_period_minutes) || 0,
            early_clock_in_minutes: Number(form.early_clock_in_minutes) || 30,
            auto_clock_out_enabled: form.auto_clock_out_enabled,
            auto_clock_out_time: form.auto_clock_out_enabled ? form.auto_clock_out_time : null,
            require_photo: form.require_photo,
            require_gps: form.require_gps,
            require_ip_check: form.require_ip_check,
        };
        if (editId) {
            await supabase.from('attendance_rules').update(payload).eq('id', editId);
        } else {
            await supabase.from('attendance_rules').insert(payload);
        }
        resetForm();
        await load();
    };

    const remove = async (id: string) => {
        if (!confirm(zh ? '確定刪除此規則？' : 'Delete this rule?')) return;
        await supabase.from('attendance_rules').delete().eq('id', id);
        await load();
    };

    const startEdit = (r: AttendanceRule) => {
        setEditId(r.id);
        setForm({
            store_id: r.store_id || '',
            grace_period_minutes: String(r.grace_period_minutes),
            early_clock_in_minutes: String(r.early_clock_in_minutes),
            auto_clock_out_enabled: r.auto_clock_out_enabled,
            auto_clock_out_time: r.auto_clock_out_time || '22:00',
            require_photo: r.require_photo,
            require_gps: r.require_gps,
            require_ip_check: r.require_ip_check,
        });
        setShowForm(true);
    };

    const resetForm = () => {
        setForm({
            store_id: '', grace_period_minutes: '5', early_clock_in_minutes: '30',
            auto_clock_out_enabled: false, auto_clock_out_time: '22:00',
            require_photo: false, require_gps: false, require_ip_check: false,
        });
        setShowForm(false);
        setEditId(null);
    };

    const BOOL_FIELDS: { key: keyof typeof form; zh: string; en: string; icon: string }[] = [
        { key: 'auto_clock_out_enabled', zh: '自動下班打卡', en: 'Auto Clock-out', icon: '⏰' },
        { key: 'require_photo', zh: '需拍照', en: 'Require Photo', icon: '📸' },
        { key: 'require_gps', zh: '需 GPS 定位', en: 'Require GPS', icon: '📍' },
        { key: 'require_ip_check', zh: '需 IP 驗證', en: 'Require IP Check', icon: '🌐' },
    ];

    return (
        <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                    ⚙️ {rules.length} {zh ? '組規則' : 'rules configured'}
                </span>
                <button className="btn btn-primary" onClick={() => { resetForm(); setShowForm(true); }}>
                    ➕ {zh ? '新增規則' : 'Add Rule'}
                </button>
            </div>

            {showForm && (
                <div className="card" style={{ marginBottom: '20px' }}>
                    <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '12px' }}>
                        {editId ? (zh ? '✏️ 編輯規則' : '✏️ Edit Rule') : (zh ? '➕ 新增規則' : '➕ Add Rule')}
                    </h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px' }}>
                        <div>
                            <label className="detail-label">{zh ? '適用門市' : 'Store'}</label>
                            <select className="input-field" value={form.store_id} onChange={e => setForm({ ...form, store_id: e.target.value })}>
                                <option value="">{zh ? '全域預設' : 'Global Default'}</option>
                                {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="detail-label">{zh ? '遲到寬限 (分鐘)' : 'Grace Period (min)'}</label>
                            <input className="input-field" type="number" min="0" value={form.grace_period_minutes}
                                onChange={e => setForm({ ...form, grace_period_minutes: e.target.value })} />
                        </div>
                        <div>
                            <label className="detail-label">{zh ? '提早打卡 (分鐘)' : 'Early Clock-in (min)'}</label>
                            <input className="input-field" type="number" min="0" value={form.early_clock_in_minutes}
                                onChange={e => setForm({ ...form, early_clock_in_minutes: e.target.value })} />
                        </div>
                        <div>
                            <label className="detail-label">{zh ? '自動下班時間' : 'Auto Clock-out Time'}</label>
                            <input className="input-field" type="time" value={form.auto_clock_out_time}
                                disabled={!form.auto_clock_out_enabled}
                                onChange={e => setForm({ ...form, auto_clock_out_time: e.target.value })} />
                        </div>
                    </div>

                    {/* Boolean toggles */}
                    <div style={{ display: 'flex', gap: '20px', marginTop: '16px', flexWrap: 'wrap' }}>
                        {BOOL_FIELDS.map(f => (
                            <label key={f.key} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}>
                                <input type="checkbox" checked={form[f.key] as boolean}
                                    onChange={e => setForm({ ...form, [f.key]: e.target.checked })} />
                                {f.icon} {zh ? f.zh : f.en}
                            </label>
                        ))}
                    </div>

                    <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }}>
                        <button className="btn btn-primary" onClick={save}>{zh ? '儲存' : 'Save'}</button>
                        <button className="btn btn-secondary" onClick={resetForm}>{zh ? '取消' : 'Cancel'}</button>
                    </div>
                </div>
            )}

            {loading ? <p className="loading-pulse">{zh ? '載入中…' : 'Loading…'}</p> : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '16px' }}>
                    {rules.length === 0 ? (
                        <div className="card" style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>
                            {zh ? '尚無打卡規則，請新增全域預設規則' : 'No rules yet. Add a global default rule to start.'}
                        </div>
                    ) : rules.map(r => (
                        <div key={r.id} className="card" style={{ padding: '16px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                <h4 style={{ fontSize: '14px', fontWeight: 600, margin: 0 }}>
                                    {r.store_id ? '🏪' : '🌍'} {r.store_name}
                                </h4>
                                <div style={{ display: 'flex', gap: '6px' }}>
                                    <button className="btn btn-secondary" style={{ fontSize: '12px', padding: '4px 8px' }} onClick={() => startEdit(r)}>✏️</button>
                                    <button className="btn btn-secondary" style={{ fontSize: '12px', padding: '4px 8px', color: 'var(--status-error)' }} onClick={() => remove(r.id)}>🗑</button>
                                </div>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '13px' }}>
                                <div>
                                    <span className="detail-label">{zh ? '遲到寬限' : 'Grace'}</span>
                                    <div>{r.grace_period_minutes} {zh ? '分鐘' : 'min'}</div>
                                </div>
                                <div>
                                    <span className="detail-label">{zh ? '提早打卡' : 'Early'}</span>
                                    <div>{r.early_clock_in_minutes} {zh ? '分鐘' : 'min'}</div>
                                </div>
                                <div>
                                    <span className="detail-label">{zh ? '自動下班' : 'Auto Out'}</span>
                                    <div>{r.auto_clock_out_enabled ? `✅ ${r.auto_clock_out_time || ''}` : '❌'}</div>
                                </div>
                                <div>
                                    <span className="detail-label">{zh ? '驗證方式' : 'Checks'}</span>
                                    <div style={{ display: 'flex', gap: '6px' }}>
                                        {r.require_photo && <span title={zh ? '拍照' : 'Photo'}>📸</span>}
                                        {r.require_gps && <span title="GPS">📍</span>}
                                        {r.require_ip_check && <span title="IP">🌐</span>}
                                        {!r.require_photo && !r.require_gps && !r.require_ip_check && <span style={{ color: 'var(--text-muted)' }}>{zh ? '無' : 'None'}</span>}
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </>
    );
}
