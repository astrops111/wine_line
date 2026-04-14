import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { getLocale } from '../lib/i18n';
import { useOrg } from '../lib/OrgContext';

// ─── Types ──────────────────────────────────────────────────────────────────

interface TieredRate {
    from_hour: number;
    to_hour: number | null;
    multiplier: number;
    label_zh: string;
    label_en: string;
}

interface OvertimeType {
    id: string;
    org_id: string;
    code: string;
    name_zh: string;
    name_en: string;
    multiplier: number;
    tiered_rates: TieredRate[] | null;
    description: string | null;
    is_active: boolean;
    sort_order: number;
}

interface OvertimeRule {
    id?: string;
    org_id: string;
    store_id: string | null;
    max_daily_ot_hours: number;
    max_monthly_ot_hours: number;
    max_quarterly_ot_hours: number;
    require_pre_approval: boolean;
    min_ot_increment_minutes: number;
    auto_calculate_ot: boolean;
    compensatory_leave_enabled: boolean;
    compensatory_leave_deadline_months: number;
    rest_day_ot_to_comp_leave: boolean;
    holiday_ot_to_comp_leave: boolean;
}

interface Store {
    id: string;
    name: string;
}

// ─── Default overtime types ─────────────────────────────────────────────────

const DEFAULT_TYPES: Omit<OvertimeType, 'id' | 'org_id'>[] = [
    {
        code: 'WEEKDAY_OT', name_zh: '平日加班', name_en: 'Weekday OT', multiplier: 1.34,
        tiered_rates: [
            { from_hour: 0, to_hour: 2, multiplier: 1.34, label_zh: '前2小時', label_en: 'First 2hrs' },
            { from_hour: 2, to_hour: null, multiplier: 1.67, label_zh: '2小時後', label_en: 'After 2hrs' },
        ],
        description: '勞基法 Art.24 §1', is_active: true, sort_order: 1,
    },
    {
        code: 'REST_DAY_OT', name_zh: '休息日加班', name_en: 'Rest Day OT', multiplier: 1.34,
        tiered_rates: [
            { from_hour: 0, to_hour: 2, multiplier: 1.34, label_zh: '前2小時', label_en: 'First 2hrs' },
            { from_hour: 2, to_hour: 8, multiplier: 1.67, label_zh: '3-8小時', label_en: '3-8hrs' },
            { from_hour: 8, to_hour: 12, multiplier: 2.67, label_zh: '9-12小時', label_en: '9-12hrs' },
        ],
        description: '勞基法 Art.24 §2', is_active: true, sort_order: 2,
    },
    {
        code: 'REGULAR_DAY_OFF_OT', name_zh: '例假日加班', name_en: 'Regular Day Off OT', multiplier: 2.0,
        tiered_rates: null,
        description: '勞基法 Art.40 (不可抗力)', is_active: true, sort_order: 3,
    },
    {
        code: 'HOLIDAY_OT', name_zh: '國定假日加班', name_en: 'National Holiday OT', multiplier: 2.0,
        tiered_rates: null,
        description: '勞基法 Art.39', is_active: true, sort_order: 4,
    },
    {
        code: 'DISASTER_OT', name_zh: '天災加班', name_en: 'Disaster OT', multiplier: 2.0,
        tiered_rates: null,
        description: '勞基法 Art.40', is_active: true, sort_order: 5,
    },
];

const DEFAULT_RULE: Omit<OvertimeRule, 'id' | 'org_id'> = {
    store_id: null,
    max_daily_ot_hours: 4,
    max_monthly_ot_hours: 46,
    max_quarterly_ot_hours: 138,
    require_pre_approval: true,
    min_ot_increment_minutes: 30,
    auto_calculate_ot: false,
    compensatory_leave_enabled: true,
    compensatory_leave_deadline_months: 6,
    rest_day_ot_to_comp_leave: false,
    holiday_ot_to_comp_leave: false,
};

// ─── Component ──────────────────────────────────────────────────────────────

export function OvertimeSettings() {
    const zh = getLocale() === 'zh-TW';
    const { orgId } = useOrg();

    const [tab, setTab] = useState<'types' | 'rules'>('types');

    // ── Tab 1: Overtime Types state ─────────────────────────────────────────
    const [types, setTypes] = useState<OvertimeType[]>([]);
    const [typesLoading, setTypesLoading] = useState(true);
    const [showTypeForm, setShowTypeForm] = useState(false);
    const [editTypeId, setEditTypeId] = useState<string | null>(null);
    const [typeForm, setTypeForm] = useState({
        code: '', name_zh: '', name_en: '', multiplier: '1.0', description: '', is_active: true, sort_order: '1',
        tiered_rates: [] as TieredRate[],
        use_tiered: false,
    });

    // ── Tab 2: Overtime Rules state ─────────────────────────────────────────
    const [rules, setRules] = useState<OvertimeRule[]>([]);
    const [rulesLoading, setRulesLoading] = useState(true);
    const [stores, setStores] = useState<Store[]>([]);
    const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);
    const [ruleForm, setRuleForm] = useState<Omit<OvertimeRule, 'id' | 'org_id'>>(DEFAULT_RULE);
    const [ruleSaving, setRuleSaving] = useState(false);

    // ─── Data Loading ───────────────────────────────────────────────────────

    const loadTypes = async () => {
        setTypesLoading(true);
        const { data } = await supabase.from('overtime_types')
            .select('*').eq('org_id', orgId).order('sort_order');
        setTypes(data || []);
        setTypesLoading(false);
    };

    const loadRules = async () => {
        setRulesLoading(true);
        const { data } = await supabase.from('overtime_rules')
            .select('*').eq('org_id', orgId);
        setRules(data || []);
        setRulesLoading(false);
    };

    const loadStores = async () => {
        const { data } = await supabase.from('stores')
            .select('id, name').eq('organization_id', orgId).order('name');
        setStores(data || []);
    };

    useEffect(() => {
        if (!orgId) return;
        loadTypes();
        loadRules();
        loadStores();
    }, [orgId]);

    // ─── When rules or selectedStoreId change, populate form ────────────────

    useEffect(() => {
        const match = rules.find(r =>
            selectedStoreId ? r.store_id === selectedStoreId : !r.store_id
        );
        if (match) {
            setRuleForm({
                store_id: match.store_id,
                max_daily_ot_hours: match.max_daily_ot_hours,
                max_monthly_ot_hours: match.max_monthly_ot_hours,
                max_quarterly_ot_hours: match.max_quarterly_ot_hours,
                require_pre_approval: match.require_pre_approval,
                min_ot_increment_minutes: match.min_ot_increment_minutes,
                auto_calculate_ot: match.auto_calculate_ot,
                compensatory_leave_enabled: match.compensatory_leave_enabled,
                compensatory_leave_deadline_months: match.compensatory_leave_deadline_months,
                rest_day_ot_to_comp_leave: match.rest_day_ot_to_comp_leave ?? false,
                holiday_ot_to_comp_leave: match.holiday_ot_to_comp_leave ?? false,
            });
        } else {
            setRuleForm({ ...DEFAULT_RULE, store_id: selectedStoreId });
        }
    }, [rules, selectedStoreId]);

    // ─── Overtime Types CRUD ────────────────────────────────────────────────

    const resetTypeForm = () => {
        setTypeForm({ code: '', name_zh: '', name_en: '', multiplier: '1.0', description: '', is_active: true, sort_order: '1', tiered_rates: [], use_tiered: false });
        setEditTypeId(null);
        setShowTypeForm(false);
    };

    const seedDefaults = async () => {
        if (!confirm(zh ? '確定要載入預設加班類型？（不會覆蓋現有資料）' : 'Load default overtime types? (will not overwrite existing)')) return;
        const existing = types.map(t => t.code);
        const toInsert = DEFAULT_TYPES.filter(d => !existing.includes(d.code)).map(d => ({ ...d, org_id: orgId }));
        if (toInsert.length === 0) { alert(zh ? '所有預設類型已存在' : 'All default types already exist'); return; }
        await supabase.from('overtime_types').insert(toInsert);
        await loadTypes();
    };

    const saveType = async () => {
        if (!typeForm.code || !typeForm.name_zh) return;
        const payload: Record<string, unknown> = {
            org_id: orgId,
            code: typeForm.code.toUpperCase(),
            name_zh: typeForm.name_zh,
            name_en: typeForm.name_en || null,
            multiplier: Number(typeForm.multiplier) || 1.0,
            tiered_rates: typeForm.use_tiered && typeForm.tiered_rates.length > 0 ? typeForm.tiered_rates : null,
            description: typeForm.description || null,
            is_active: typeForm.is_active,
            sort_order: Number(typeForm.sort_order) || 0,
        };
        if (editTypeId) {
            await supabase.from('overtime_types').update(payload).eq('id', editTypeId);
        } else {
            await supabase.from('overtime_types').insert(payload);
        }
        resetTypeForm();
        await loadTypes();
    };

    const deleteType = async (id: string) => {
        if (!confirm(zh ? '確定刪除此加班類型？' : 'Delete this overtime type?')) return;
        await supabase.from('overtime_types').delete().eq('id', id);
        await loadTypes();
    };

    const startEditType = (t: OvertimeType) => {
        setEditTypeId(t.id);
        setTypeForm({
            code: t.code, name_zh: t.name_zh, name_en: t.name_en || '', multiplier: String(t.multiplier),
            description: t.description || '', is_active: t.is_active, sort_order: String(t.sort_order),
            tiered_rates: t.tiered_rates || [],
            use_tiered: !!(t.tiered_rates && t.tiered_rates.length > 0),
        });
        setShowTypeForm(true);
    };

    const toggleTypeActive = async (t: OvertimeType) => {
        await supabase.from('overtime_types').update({ is_active: !t.is_active }).eq('id', t.id);
        await loadTypes();
    };

    // ─── Tiered rates helpers ───────────────────────────────────────────────

    const addTier = () => {
        const last = typeForm.tiered_rates[typeForm.tiered_rates.length - 1];
        const fromHour = last ? (last.to_hour ?? last.from_hour + 2) : 0;
        setTypeForm({
            ...typeForm,
            tiered_rates: [...typeForm.tiered_rates, { from_hour: fromHour, to_hour: fromHour + 2, multiplier: 1.0, label_zh: '', label_en: '' }],
        });
    };

    const updateTier = (idx: number, field: keyof TieredRate, value: string | number | null) => {
        const updated = [...typeForm.tiered_rates];
        (updated[idx] as Record<string, unknown>)[field] = value;
        setTypeForm({ ...typeForm, tiered_rates: updated });
    };

    const removeTier = (idx: number) => {
        setTypeForm({ ...typeForm, tiered_rates: typeForm.tiered_rates.filter((_, i) => i !== idx) });
    };

    // ─── Overtime Rules Save ────────────────────────────────────────────────

    const saveRule = async () => {
        setRuleSaving(true);
        const existing = rules.find(r =>
            selectedStoreId ? r.store_id === selectedStoreId : !r.store_id
        );
        const payload = { ...ruleForm, org_id: orgId, store_id: selectedStoreId };
        if (existing?.id) {
            await supabase.from('overtime_rules').update(payload).eq('id', existing.id);
        } else {
            await supabase.from('overtime_rules').insert(payload);
        }
        await loadRules();
        setRuleSaving(false);
    };

    // ─── Render ─────────────────────────────────────────────────────────────

    return (
        <div className="fade-in">
            <div className="page-header">
                <h1>⏱ {zh ? '加班設定' : 'Overtime Settings'}</h1>
                <p className="page-subtitle">{zh ? '管理加班類型與加班規則設定' : 'Manage overtime types and overtime rule configurations'}</p>
            </div>

            {/* Tab bar */}
            <div className="tab-bar" style={{ marginBottom: '20px' }}>
                <button className={`tab-item ${tab === 'types' ? 'active' : ''}`} onClick={() => setTab('types')}>
                    💼 {zh ? '維護加班類型' : 'Overtime Type Management'}
                </button>
                <button className={`tab-item ${tab === 'rules' ? 'active' : ''}`} onClick={() => setTab('rules')}>
                    📋 {zh ? '加班規則設定' : 'Overtime Rules'}
                </button>
            </div>

            {/* ═══════════════════════════════════════════════════════════════
                Tab 1: Overtime Type Management
            ═══════════════════════════════════════════════════════════════ */}
            {tab === 'types' && (
                <div>
                    {/* Toolbar */}
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
                        <button className="btn btn-primary" onClick={() => { resetTypeForm(); setShowTypeForm(true); }}>
                            ➕ {zh ? '新增加班類型' : 'Add Overtime Type'}
                        </button>
                        <button className="btn btn-secondary" onClick={seedDefaults}>
                            📥 {zh ? '載入預設類型' : 'Load Defaults'}
                        </button>
                        <span style={{ marginLeft: 'auto', fontSize: '13px', color: 'var(--text-muted)' }}>
                            {types.length} {zh ? '個類型' : 'types'} · {types.filter(t => t.is_active).length} {zh ? '啟用' : 'active'}
                        </span>
                    </div>

                    {/* Add/Edit form */}
                    {showTypeForm && (
                        <div className="card" style={{ marginBottom: '20px', padding: '20px' }}>
                            <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '14px' }}>
                                {editTypeId ? (zh ? '✏️ 編輯加班類型' : '✏️ Edit Overtime Type') : (zh ? '➕ 新增加班類型' : '➕ Add Overtime Type')}
                            </h3>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px' }}>
                                <div>
                                    <label className="detail-label">{zh ? '代碼' : 'Code'} *</label>
                                    <input className="input-field" value={typeForm.code} onChange={e => setTypeForm({ ...typeForm, code: e.target.value })}
                                        placeholder="WEEKDAY_OT" style={{ textTransform: 'uppercase' }} />
                                </div>
                                <div>
                                    <label className="detail-label">{zh ? '中文名稱' : 'Chinese Name'} *</label>
                                    <input className="input-field" value={typeForm.name_zh} onChange={e => setTypeForm({ ...typeForm, name_zh: e.target.value })}
                                        placeholder="平日加班" />
                                </div>
                                <div>
                                    <label className="detail-label">{zh ? '英文名稱' : 'English Name'}</label>
                                    <input className="input-field" value={typeForm.name_en} onChange={e => setTypeForm({ ...typeForm, name_en: e.target.value })}
                                        placeholder="Weekday OT" />
                                </div>
                                <div>
                                    <label className="detail-label">{zh ? '基本倍率' : 'Base Multiplier'}</label>
                                    <input className="input-field" type="number" step="0.01" value={typeForm.multiplier}
                                        onChange={e => setTypeForm({ ...typeForm, multiplier: e.target.value })} />
                                </div>
                                <div>
                                    <label className="detail-label">{zh ? '排序' : 'Sort Order'}</label>
                                    <input className="input-field" type="number" value={typeForm.sort_order}
                                        onChange={e => setTypeForm({ ...typeForm, sort_order: e.target.value })} />
                                </div>
                                <div>
                                    <label className="detail-label">{zh ? '說明' : 'Description'}</label>
                                    <input className="input-field" value={typeForm.description}
                                        onChange={e => setTypeForm({ ...typeForm, description: e.target.value })} placeholder="勞基法 Art.24 §1" />
                                </div>
                            </div>

                            {/* Active toggle */}
                            <div style={{ marginTop: '12px' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer' }}>
                                    <input type="checkbox" checked={typeForm.is_active} onChange={e => setTypeForm({ ...typeForm, is_active: e.target.checked })} />
                                    {zh ? '啟用' : 'Active'}
                                </label>
                            </div>

                            {/* Tiered rates toggle */}
                            <div style={{ marginTop: '12px' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer' }}>
                                    <input type="checkbox" checked={typeForm.use_tiered}
                                        onChange={e => setTypeForm({ ...typeForm, use_tiered: e.target.checked })} />
                                    {zh ? '使用階梯費率' : 'Use Tiered Rates'}
                                </label>
                            </div>

                            {/* Tiered rates editor */}
                            {typeForm.use_tiered && (
                                <div style={{ marginTop: '14px', padding: '14px', background: 'var(--bg-tertiary)', borderRadius: '8px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                                        <span style={{ fontSize: '13px', fontWeight: 600 }}>📊 {zh ? '階梯費率' : 'Tiered Rates'}</span>
                                        <button className="btn btn-sm btn-secondary" onClick={addTier}>
                                            ➕ {zh ? '新增階層' : 'Add Tier'}
                                        </button>
                                    </div>
                                    {typeForm.tiered_rates.length === 0 && (
                                        <p style={{ fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                                            {zh ? '尚無階梯費率，點擊新增' : 'No tiers yet, click to add'}
                                        </p>
                                    )}
                                    {typeForm.tiered_rates.map((tier, idx) => (
                                        <div key={idx} style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap' }}>
                                            <div style={{ minWidth: '70px' }}>
                                                <label className="detail-label" style={{ fontSize: '11px' }}>{zh ? '起始' : 'From'} (hr)</label>
                                                <input className="input-field" type="number" step="0.5" value={tier.from_hour}
                                                    onChange={e => updateTier(idx, 'from_hour', Number(e.target.value))}
                                                    style={{ width: '70px' }} />
                                            </div>
                                            <div style={{ minWidth: '70px' }}>
                                                <label className="detail-label" style={{ fontSize: '11px' }}>{zh ? '結束' : 'To'} (hr)</label>
                                                <input className="input-field" type="number" step="0.5" value={tier.to_hour ?? ''}
                                                    onChange={e => updateTier(idx, 'to_hour', e.target.value ? Number(e.target.value) : null)}
                                                    style={{ width: '70px' }} placeholder="∞" />
                                            </div>
                                            <div style={{ minWidth: '80px' }}>
                                                <label className="detail-label" style={{ fontSize: '11px' }}>{zh ? '倍率' : 'Rate'}</label>
                                                <input className="input-field" type="number" step="0.01" value={tier.multiplier}
                                                    onChange={e => updateTier(idx, 'multiplier', Number(e.target.value))}
                                                    style={{ width: '80px' }} />
                                            </div>
                                            <div style={{ minWidth: '100px' }}>
                                                <label className="detail-label" style={{ fontSize: '11px' }}>{zh ? '中文標籤' : 'Label ZH'}</label>
                                                <input className="input-field" value={tier.label_zh}
                                                    onChange={e => updateTier(idx, 'label_zh', e.target.value)}
                                                    style={{ width: '100px' }} placeholder="前2小時" />
                                            </div>
                                            <div style={{ minWidth: '100px' }}>
                                                <label className="detail-label" style={{ fontSize: '11px' }}>{zh ? '英文標籤' : 'Label EN'}</label>
                                                <input className="input-field" value={tier.label_en}
                                                    onChange={e => updateTier(idx, 'label_en', e.target.value)}
                                                    style={{ width: '100px' }} placeholder="First 2hrs" />
                                            </div>
                                            <button className="btn btn-sm btn-danger" onClick={() => removeTier(idx)}
                                                style={{ marginTop: '18px' }}>🗑</button>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Form actions */}
                            <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }}>
                                <button className="btn btn-primary" onClick={saveType}>
                                    {zh ? '儲存' : 'Save'}
                                </button>
                                <button className="btn btn-secondary" onClick={resetTypeForm}>
                                    {zh ? '取消' : 'Cancel'}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Types table */}
                    {typesLoading ? (
                        <p className="loading-pulse">{zh ? '載入中…' : 'Loading…'}</p>
                    ) : types.length === 0 ? (
                        <div className="card" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                            <p style={{ fontSize: '32px', marginBottom: '8px' }}>💼</p>
                            <p>{zh ? '尚無加班類型，請新增或載入預設' : 'No overtime types yet. Add or load defaults.'}</p>
                        </div>
                    ) : (
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                                <thead>
                                    <tr style={{ borderBottom: '2px solid var(--border-primary)', textAlign: 'left' }}>
                                        <th style={{ padding: '10px 8px' }}>{zh ? '排序' : 'Order'}</th>
                                        <th style={{ padding: '10px 8px' }}>{zh ? '代碼' : 'Code'}</th>
                                        <th style={{ padding: '10px 8px' }}>{zh ? '名稱' : 'Name'}</th>
                                        <th style={{ padding: '10px 8px' }}>{zh ? '倍率' : 'Rate'}</th>
                                        <th style={{ padding: '10px 8px' }}>{zh ? '階梯費率' : 'Tiered Rates'}</th>
                                        <th style={{ padding: '10px 8px' }}>{zh ? '說明' : 'Description'}</th>
                                        <th style={{ padding: '10px 8px' }}>{zh ? '狀態' : 'Status'}</th>
                                        <th style={{ padding: '10px 8px' }}>{zh ? '操作' : 'Actions'}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {types.map(t => (
                                        <tr key={t.id} style={{ borderBottom: '1px solid var(--border-secondary)', opacity: t.is_active ? 1 : 0.5 }}>
                                            <td style={{ padding: '10px 8px' }}>{t.sort_order}</td>
                                            <td style={{ padding: '10px 8px', fontFamily: 'monospace', fontSize: '12px' }}>{t.code}</td>
                                            <td style={{ padding: '10px 8px' }}>
                                                <div style={{ fontWeight: 600 }}>{t.name_zh}</div>
                                                {t.name_en && <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{t.name_en}</div>}
                                            </td>
                                            <td style={{ padding: '10px 8px', fontWeight: 600 }}>{t.multiplier}x</td>
                                            <td style={{ padding: '10px 8px' }}>
                                                {t.tiered_rates && t.tiered_rates.length > 0 ? (
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                                        {t.tiered_rates.map((tier, i) => (
                                                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}>
                                                                <span style={{
                                                                    display: 'inline-block', padding: '1px 6px', borderRadius: '4px',
                                                                    background: tier.multiplier >= 2 ? 'var(--bg-danger, #fee2e2)' : tier.multiplier >= 1.5 ? 'var(--bg-warning, #fef3c7)' : 'var(--bg-success, #dcfce7)',
                                                                    color: tier.multiplier >= 2 ? 'var(--text-danger, #dc2626)' : tier.multiplier >= 1.5 ? 'var(--text-warning, #d97706)' : 'var(--text-success, #16a34a)',
                                                                    fontWeight: 600, fontSize: '11px',
                                                                }}>
                                                                    {tier.multiplier}x
                                                                </span>
                                                                <span style={{ color: 'var(--text-secondary)' }}>
                                                                    {zh ? tier.label_zh : tier.label_en}
                                                                    {' '}({tier.from_hour}–{tier.to_hour ?? '∞'}h)
                                                                </span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>—</span>
                                                )}
                                            </td>
                                            <td style={{ padding: '10px 8px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                                                {t.description || '—'}
                                            </td>
                                            <td style={{ padding: '10px 8px' }}>
                                                <span style={{
                                                    display: 'inline-block', padding: '2px 8px', borderRadius: '9999px', fontSize: '11px', fontWeight: 600,
                                                    background: t.is_active ? 'var(--bg-success, #dcfce7)' : 'var(--bg-tertiary)',
                                                    color: t.is_active ? 'var(--text-success, #16a34a)' : 'var(--text-muted)',
                                                }}>
                                                    {t.is_active ? (zh ? '啟用' : 'Active') : (zh ? '停用' : 'Inactive')}
                                                </span>
                                            </td>
                                            <td style={{ padding: '10px 8px' }}>
                                                <div style={{ display: 'flex', gap: '4px' }}>
                                                    <button className="btn btn-sm btn-secondary" onClick={() => startEditType(t)} title={zh ? '編輯' : 'Edit'}>✏️</button>
                                                    <button className="btn btn-sm btn-secondary" onClick={() => toggleTypeActive(t)}
                                                        title={t.is_active ? (zh ? '停用' : 'Disable') : (zh ? '啟用' : 'Enable')}>
                                                        {t.is_active ? '🚫' : '✅'}
                                                    </button>
                                                    <button className="btn btn-sm btn-danger" onClick={() => deleteType(t.id)} title={zh ? '刪除' : 'Delete'}>🗑</button>
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

            {/* ═══════════════════════════════════════════════════════════════
                Tab 2: Overtime Rules
            ═══════════════════════════════════════════════════════════════ */}
            {tab === 'rules' && (
                <div>
                    {/* Store selector for per-store override */}
                    <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <label className="detail-label" style={{ margin: 0 }}>{zh ? '適用範圍' : 'Scope'}:</label>
                        <div className="tab-bar" style={{ marginBottom: 0 }}>
                            <button className={`tab-item ${selectedStoreId === null ? 'active' : ''}`} onClick={() => setSelectedStoreId(null)}>
                                🏢 {zh ? '全組織預設' : 'Org Default'}
                            </button>
                            {stores.map(s => (
                                <button key={s.id} className={`tab-item ${selectedStoreId === s.id ? 'active' : ''}`} onClick={() => setSelectedStoreId(s.id)}>
                                    🏪 {s.name}
                                </button>
                            ))}
                        </div>
                        {selectedStoreId && (
                            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                                ⚠️ {zh ? '門市設定將覆蓋組織預設' : 'Store settings override org defaults'}
                            </span>
                        )}
                    </div>

                    {rulesLoading ? (
                        <p className="loading-pulse">{zh ? '載入中…' : 'Loading…'}</p>
                    ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(420px, 1fr))', gap: '20px' }}>
                            {/* Working Hours Limits */}
                            <div className="card" style={{ padding: '20px' }}>
                                <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '16px' }}>
                                    ⏰ {zh ? '加班時數上限' : 'Overtime Hour Limits'}
                                </h3>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                                    <div>
                                        <label className="detail-label">{zh ? '每日加班上限（小時）' : 'Max Daily OT Hours'}</label>
                                        <input className="input-field" type="number" step="0.5" value={ruleForm.max_daily_ot_hours}
                                            onChange={e => setRuleForm({ ...ruleForm, max_daily_ot_hours: Number(e.target.value) })} />
                                        <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                                            {zh ? '勞基法 Art.32§2：每日含加班不超過12小時（正常8hr + 4hr加班）' : 'LSA Art.32§2: Max 12hrs/day total (8hr regular + 4hr OT)'}
                                        </p>
                                    </div>
                                    <div>
                                        <label className="detail-label">{zh ? '每月加班上限（小時）' : 'Max Monthly OT Hours'}</label>
                                        <input className="input-field" type="number" step="1" value={ruleForm.max_monthly_ot_hours}
                                            onChange={e => setRuleForm({ ...ruleForm, max_monthly_ot_hours: Number(e.target.value) })} />
                                        <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                                            {zh ? '勞基法 Art.32§2：每月加班上限46小時' : 'LSA Art.32§2: Max 46hrs/month'}
                                        </p>
                                    </div>
                                    <div>
                                        <label className="detail-label">{zh ? '每季加班上限（小時，需勞資會議同意）' : 'Max Quarterly OT Hours (with consent)'}</label>
                                        <input className="input-field" type="number" step="1" value={ruleForm.max_quarterly_ot_hours}
                                            onChange={e => setRuleForm({ ...ruleForm, max_quarterly_ot_hours: Number(e.target.value) })} />
                                        <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                                            {zh ? '勞基法 Art.32§3：經勞資會議同意，每月可達54小時，每三個月不超過138小時' : 'LSA Art.32§3: With labor-management consent, max 54hrs/month, 138hrs/3months'}
                                        </p>
                                    </div>
                                    <div>
                                        <label className="detail-label">{zh ? '最小加班計算單位（分鐘）' : 'Min OT Increment (minutes)'}</label>
                                        <input className="input-field" type="number" step="5" value={ruleForm.min_ot_increment_minutes}
                                            onChange={e => setRuleForm({ ...ruleForm, min_ot_increment_minutes: Number(e.target.value) })} />
                                        <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                                            {zh ? '加班以此分鐘數為最小計算單位' : 'Minimum increment for OT calculation'}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Approval & Calculation */}
                            <div className="card" style={{ padding: '20px' }}>
                                <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '16px' }}>
                                    ✅ {zh ? '審核與計算' : 'Approval & Calculation'}
                                </h3>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '14px' }}>
                                        <input type="checkbox" checked={ruleForm.require_pre_approval}
                                            onChange={e => setRuleForm({ ...ruleForm, require_pre_approval: e.target.checked })}
                                            style={{ width: '18px', height: '18px' }} />
                                        <div>
                                            <div style={{ fontWeight: 500 }}>{zh ? '需事前申請核准' : 'Require Pre-Approval'}</div>
                                            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                                                {zh ? '加班前須先提交申請經主管核准' : 'OT must be pre-approved before working'}
                                            </div>
                                        </div>
                                    </label>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '14px' }}>
                                        <input type="checkbox" checked={ruleForm.auto_calculate_ot}
                                            onChange={e => setRuleForm({ ...ruleForm, auto_calculate_ot: e.target.checked })}
                                            style={{ width: '18px', height: '18px' }} />
                                        <div>
                                            <div style={{ fontWeight: 500 }}>{zh ? '自動偵測加班' : 'Auto-Calculate OT'}</div>
                                            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                                                {zh ? '根據打卡紀錄自動計算加班時數' : 'Auto-detect overtime from time records'}
                                            </div>
                                        </div>
                                    </label>
                                </div>
                            </div>

                            {/* Compensatory Leave (補休) */}
                            <div className="card" style={{ padding: '20px' }}>
                                <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '16px' }}>
                                    🔄 {zh ? '補休設定' : 'Compensatory Leave Settings'}
                                </h3>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '14px' }}>
                                        <input type="checkbox" checked={ruleForm.compensatory_leave_enabled}
                                            onChange={e => setRuleForm({ ...ruleForm, compensatory_leave_enabled: e.target.checked })}
                                            style={{ width: '18px', height: '18px' }} />
                                        <div>
                                            <div style={{ fontWeight: 500 }}>{zh ? '啟用補休' : 'Enable Compensatory Leave'}</div>
                                            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                                                {zh ? '勞基法 Art.32-1：經勞工同意可以補休代替加班費' : 'LSA Art.32-1: With employee consent, comp leave instead of OT pay'}
                                            </div>
                                        </div>
                                    </label>

                                    {ruleForm.compensatory_leave_enabled && (
                                        <>
                                            <div>
                                                <label className="detail-label">{zh ? '補休期限（月）' : 'Comp Leave Deadline (months)'}</label>
                                                <input className="input-field" type="number" step="1" value={ruleForm.compensatory_leave_deadline_months}
                                                    onChange={e => setRuleForm({ ...ruleForm, compensatory_leave_deadline_months: Number(e.target.value) })} />
                                                <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                                                    {zh ? '補休應於加班日起算期限內休完，逾期折算工資' : 'Must be used within deadline from OT date; expired balance paid as wages'}
                                                </p>
                                            </div>
                                            <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '14px' }}>
                                                <input type="checkbox" checked={ruleForm.rest_day_ot_to_comp_leave}
                                                    onChange={e => setRuleForm({ ...ruleForm, rest_day_ot_to_comp_leave: e.target.checked })}
                                                    style={{ width: '18px', height: '18px' }} />
                                                <div>
                                                    <div style={{ fontWeight: 500 }}>{zh ? '休息日加班可選補休' : 'Rest Day OT → Comp Leave'}</div>
                                                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                                                        {zh ? '員工可選擇休息日加班轉為補休' : 'Employees may convert rest day OT to comp leave'}
                                                    </div>
                                                </div>
                                            </label>
                                            <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '14px' }}>
                                                <input type="checkbox" checked={ruleForm.holiday_ot_to_comp_leave}
                                                    onChange={e => setRuleForm({ ...ruleForm, holiday_ot_to_comp_leave: e.target.checked })}
                                                    style={{ width: '18px', height: '18px' }} />
                                                <div>
                                                    <div style={{ fontWeight: 500 }}>{zh ? '國定假日加班可選補休' : 'Holiday OT → Comp Leave'}</div>
                                                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                                                        {zh ? '員工可選擇國定假日加班轉為補休' : 'Employees may convert holiday OT to comp leave'}
                                                    </div>
                                                </div>
                                            </label>
                                        </>
                                    )}
                                </div>
                            </div>

                            {/* Legal Reference */}
                            <div className="card" style={{ padding: '20px', background: 'var(--bg-tertiary)' }}>
                                <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '16px' }}>
                                    ⚖️ {zh ? '法規參考' : 'Legal Reference'}
                                </h3>
                                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <span style={{ fontWeight: 600, minWidth: '100px' }}>Art. 24 §1</span>
                                        <span>{zh ? '平日加班：前2小時 ×1⅓，之後 ×1⅔' : 'Weekday OT: first 2hrs ×1⅓, after ×1⅔'}</span>
                                    </div>
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <span style={{ fontWeight: 600, minWidth: '100px' }}>Art. 24 §2</span>
                                        <span>{zh ? '休息日加班：前2小時 ×1⅓，3-8小時 ×1⅔，9-12小時 ×2⅔' : 'Rest day OT: first 2hrs ×1⅓, 3-8hrs ×1⅔, 9-12hrs ×2⅔'}</span>
                                    </div>
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <span style={{ fontWeight: 600, minWidth: '100px' }}>Art. 32 §2</span>
                                        <span>{zh ? '每日含加班 ≤12小時，每月加班 ≤46小時' : 'Total daily ≤12hrs, monthly OT ≤46hrs'}</span>
                                    </div>
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <span style={{ fontWeight: 600, minWidth: '100px' }}>Art. 32 §3</span>
                                        <span>{zh ? '經勞資會議同意：每月 ≤54小時，每3個月 ≤138小時' : 'With consent: monthly ≤54hrs, quarterly ≤138hrs'}</span>
                                    </div>
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <span style={{ fontWeight: 600, minWidth: '100px' }}>Art. 32-1</span>
                                        <span>{zh ? '加班補休：經勞工同意可補休，逾期折算工資' : 'Comp leave: with consent; expired balance paid as wages'}</span>
                                    </div>
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <span style={{ fontWeight: 600, minWidth: '100px' }}>Art. 39</span>
                                        <span>{zh ? '國定假日出勤：薪資加倍（×2.0）' : 'Holiday work: double pay (×2.0)'}</span>
                                    </div>
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <span style={{ fontWeight: 600, minWidth: '100px' }}>Art. 40</span>
                                        <span>{zh ? '例假日：原則禁止出勤，天災等不可抗力除外' : 'Regular day off: work prohibited except force majeure'}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Save button */}
                    <div style={{ marginTop: '20px', display: 'flex', gap: '12px', alignItems: 'center' }}>
                        <button className="btn btn-primary" onClick={saveRule} disabled={ruleSaving}>
                            {ruleSaving ? (zh ? '儲存中…' : 'Saving…') : (zh ? '💾 儲存設定' : '💾 Save Settings')}
                        </button>
                        {selectedStoreId && (
                            <button className="btn btn-secondary" onClick={() => {
                                if (!confirm(zh ? '確定要重設為組織預設值？' : 'Reset to org defaults?')) return;
                                const orgDefault = rules.find(r => !r.store_id);
                                if (orgDefault) {
                                    setRuleForm({
                                        store_id: selectedStoreId,
                                        max_daily_ot_hours: orgDefault.max_daily_ot_hours,
                                        max_monthly_ot_hours: orgDefault.max_monthly_ot_hours,
                                        max_quarterly_ot_hours: orgDefault.max_quarterly_ot_hours,
                                        require_pre_approval: orgDefault.require_pre_approval,
                                        min_ot_increment_minutes: orgDefault.min_ot_increment_minutes,
                                        auto_calculate_ot: orgDefault.auto_calculate_ot,
                                        compensatory_leave_enabled: orgDefault.compensatory_leave_enabled,
                                        compensatory_leave_deadline_months: orgDefault.compensatory_leave_deadline_months,
                                        rest_day_ot_to_comp_leave: orgDefault.rest_day_ot_to_comp_leave ?? false,
                                        holiday_ot_to_comp_leave: orgDefault.holiday_ot_to_comp_leave ?? false,
                                    });
                                } else {
                                    setRuleForm({ ...DEFAULT_RULE, store_id: selectedStoreId });
                                }
                            }}>
                                🔄 {zh ? '重設為組織預設' : 'Reset to Org Default'}
                            </button>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
