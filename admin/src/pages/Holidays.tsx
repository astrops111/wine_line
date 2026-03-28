import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { t, getLocale } from '../lib/i18n';
import { useOrg } from '../lib/OrgContext';

interface Holiday {
    id: string; date: string; name_zh: string; name_en: string | null;
    holiday_type: string; pay_multiplier: number; year: number; is_active: boolean;
}

export function Holidays() {
    const zh = getLocale() === 'zh-TW';
    const { orgId } = useOrg();
    const [holidays, setHolidays] = useState<Holiday[]>([]);
    const [loading, setLoading] = useState(true);
    const [year, setYear] = useState(new Date().getFullYear());
    const [showAdd, setShowAdd] = useState(false);
    const [editId, setEditId] = useState<string | null>(null);
    const [form, setForm] = useState({ date: '', name_zh: '', name_en: '', holiday_type: 'national', pay_multiplier: '2.0' });

    const loadHolidays = async () => {
        const { data } = await supabase.from('national_holidays')
            .select('*').eq('year', year).order('date');
        setHolidays(data || []);
    };

    useEffect(() => { loadHolidays().then(() => setLoading(false)); }, [year]);

    const saveHoliday = async () => {
        if (!form.date || !form.name_zh) return;
        const payload = {
            organization_id: orgId,
            date: form.date, name_zh: form.name_zh, name_en: form.name_en || null,
            holiday_type: form.holiday_type, pay_multiplier: Number(form.pay_multiplier) || 2.0,
            year: new Date(form.date).getFullYear(), is_active: true,
        };
        if (editId) {
            await supabase.from('national_holidays').update(payload).eq('id', editId);
        } else {
            await supabase.from('national_holidays').insert(payload);
        }
        setForm({ date: '', name_zh: '', name_en: '', holiday_type: 'national', pay_multiplier: '2.0' });
        setShowAdd(false); setEditId(null);
        await loadHolidays();
    };

    const deleteHoliday = async (id: string) => {
        if (!confirm(zh ? '確定刪除此假日？' : 'Delete this holiday?')) return;
        await supabase.from('national_holidays').delete().eq('id', id);
        await loadHolidays();
    };

    const startEdit = (h: Holiday) => {
        setEditId(h.id);
        setForm({ date: h.date, name_zh: h.name_zh, name_en: h.name_en || '', holiday_type: h.holiday_type, pay_multiplier: String(h.pay_multiplier) });
        setShowAdd(true);
    };

    const typeIcon: Record<string, string> = { national: '🏛', company: '🏢', custom: '📌' };
    const typeLabel: Record<string, string> = { national: zh ? '國定假日' : 'National', company: zh ? '公司假日' : 'Company', custom: zh ? '自訂假日' : 'Custom' };
    const months = zh
        ? ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月']
        : ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    // Group holidays by month
    const byMonth: Record<number, Holiday[]> = {};
    holidays.forEach(h => {
        const m = new Date(h.date).getMonth();
        byMonth[m] = byMonth[m] || [];
        byMonth[m].push(h);
    });

    return (
        <div className="fade-in">
            <div className="page-header">
                <h1>🗓 {t('holiday.title')}</h1>
                <p className="page-subtitle">{t('holiday.subtitle')}</p>
            </div>

            {/* Toolbar */}
            <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', alignItems: 'center', flexWrap: 'wrap' }}>
                <div className="tab-bar" style={{ marginBottom: 0 }}>
                    {[2026, 2027, 2028].map(y => (
                        <button key={y} className={`tab-item ${year === y ? 'active' : ''}`} onClick={() => setYear(y)}>
                            {y}
                        </button>
                    ))}
                </div>
                <div style={{ display: 'flex', gap: '8px', fontSize: '13px', color: 'var(--text-secondary)', marginLeft: '12px' }}>
                    <span>📊 {holidays.length} {zh ? '個假日' : 'holidays'}</span>
                    <span>·</span>
                    <span>{typeIcon.national} {holidays.filter(h => h.holiday_type === 'national').length} {zh ? '國定' : 'National'}</span>
                    <span>{typeIcon.company} {holidays.filter(h => h.holiday_type === 'company').length} {zh ? '公司' : 'Company'}</span>
                </div>
                <div style={{ marginLeft: 'auto' }}>
                    <button className="btn btn-primary" onClick={() => { setShowAdd(true); setEditId(null); setForm({ date: `${year}-01-01`, name_zh: '', name_en: '', holiday_type: 'national', pay_multiplier: '2.0' }); }}>
                        ➕ {t('holiday.add')}
                    </button>
                </div>
            </div>

            {/* Add/Edit form */}
            {showAdd && (
                <div className="card" style={{ marginBottom: '20px' }}>
                    <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '14px' }}>
                        {editId ? (zh ? '✏️ 編輯假日' : '✏️ Edit Holiday') : '➕ ' + t('holiday.add')}
                    </h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px' }}>
                        <div>
                            <label className="detail-label" htmlFor="holiday-date">{zh ? '日期' : 'Date'} *</label>
                            <input id="holiday-date" className="input-field" type="date" name="date" autoComplete="off" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
                        </div>
                        <div>
                            <label className="detail-label" htmlFor="holiday-name-zh">{zh ? '中文名稱' : 'Chinese Name'} *</label>
                            <input id="holiday-name-zh" className="input-field" name="nameZh" autoComplete="off" value={form.name_zh} onChange={e => setForm({ ...form, name_zh: e.target.value })} placeholder="元旦…" />
                        </div>
                        <div>
                            <label className="detail-label" htmlFor="holiday-name-en">{zh ? '英文名稱' : 'English Name'}</label>
                            <input id="holiday-name-en" className="input-field" name="nameEn" autoComplete="off" spellCheck={false} value={form.name_en} onChange={e => setForm({ ...form, name_en: e.target.value })} placeholder="New Year’s Day…" />
                        </div>
                        <div>
                            <label className="detail-label" htmlFor="holiday-type">{zh ? '類型' : 'Type'}</label>
                            <select id="holiday-type" className="input-field" name="holidayType" value={form.holiday_type} onChange={e => setForm({ ...form, holiday_type: e.target.value })}>
                                <option value="national">{typeLabel.national}</option>
                                <option value="company">{typeLabel.company}</option>
                                <option value="custom">{typeLabel.custom}</option>
                            </select>
                        </div>
                        <div>
                            <label className="detail-label" htmlFor="holiday-multiplier">{t('holiday.pay_multiplier')}</label>
                            <input id="holiday-multiplier" className="input-field" type="number" name="payMultiplier" autoComplete="off" step="0.1" value={form.pay_multiplier} onChange={e => setForm({ ...form, pay_multiplier: e.target.value })} />
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }}>
                        <button className="btn btn-primary" onClick={saveHoliday}>{t('common.save')}</button>
                        <button className="btn btn-secondary" onClick={() => { setShowAdd(false); setEditId(null); }}>{t('common.cancel')}</button>
                    </div>
                </div>
            )}

            {loading ? <p className="loading-pulse">{t('common.loading')}</p> : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
                    {Array.from({ length: 12 }, (_, m) => (
                        <div key={m} className="card" style={{ padding: '14px', opacity: (byMonth[m]?.length || 0) > 0 ? 1 : 0.5 }}>
                            <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '10px', color: 'var(--text-secondary)' }}>
                                📅 {months[m]}
                            </div>
                            {(byMonth[m] || []).length === 0 ? (
                                <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                                    {zh ? '無假日' : 'No holidays'}
                                </div>
                            ) : (
                                (byMonth[m] || []).map(h => (
                                    <div key={h.id} style={{
                                        display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px',
                                        background: 'var(--bg-primary)', borderRadius: 'var(--radius-sm)', marginBottom: '4px',
                                    }}>
                                        <span style={{ fontSize: '13px', color: 'var(--accent-primary)', fontWeight: 600, minWidth: '40px' }}>
                                            {new Date(h.date + 'T00:00:00').getDate()}{zh ? '日' : ''}
                                        </span>
                                        <span style={{ fontSize: '11px' }}>{typeIcon[h.holiday_type]}</span>
                                        <span style={{ flex: 1, fontSize: '13px' }}>{zh ? h.name_zh : (h.name_en || h.name_zh)}</span>
                                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{h.pay_multiplier}×</span>
                                        <button className="btn btn-sm" style={{ padding: '2px 6px', fontSize: '11px' }} onClick={() => startEdit(h)} aria-label="編輯">✏️</button>
                                        <button className="btn btn-sm" style={{ padding: '2px 6px', fontSize: '11px', color: 'var(--accent-red)' }} onClick={() => deleteHoliday(h.id)} aria-label="刪除">✕</button>
                                    </div>
                                ))
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
