import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { getLocale } from '../lib/i18n';

interface EmployeeHours {
    user_id: string;
    name: string;
    employee_type: string;
    store_name: string | null;
    total_hours: number;
    expected_hours: number;
    records_count: number;
    late_count: number;
}

interface Store { id: string; name: string; }

export function HrDashboard() {
    const zh = getLocale() === 'zh-TW';
    const [loading, setLoading] = useState(false);
    const [tab, setTab] = useState<'report' | 'export' | 'risk'>('report');

    // Filters
    const [stores, setStores] = useState<Store[]>([]);
    const [employees, setEmployees] = useState<{ id: string, name: string }[]>([]);
    const [selectedStore, setSelectedStore] = useState('all');
    const [employeeType, setEmployeeType] = useState('all');
    const [selectedEmployee, setSelectedEmployee] = useState('all');
    const [startDate, setStartDate] = useState(() => {
        const d = new Date(); d.setDate(1); // First day of month
        return d.toISOString().split('T')[0];
    });
    const [endDate, setEndDate] = useState(() => {
        const d = new Date();
        return d.toISOString().split('T')[0];
    });

    const [data, setData] = useState<EmployeeHours[]>([]);
    const [absenceAlerts, setAbsenceAlerts] = useState<{
        employee_name: string;
        store_name: string;
        shift_date: string;
        shift_start: string;
        shift_end: string;
    }[]>([]);

    // Quick month selector options
    const months = Array.from({ length: 12 }, (_, i) => {
        const d = new Date();
        d.setDate(1);
        d.setMonth(d.getMonth() - i);
        return {
            value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
            label: `${d.getFullYear()}/${d.getMonth() + 1}月`
        };
    });

    const handleQuickMonth = (monthVal: string) => {
        if (!monthVal) return;
        const [y, m] = monthVal.split('-').map(Number);
        const first = new Date(y, m - 1, 1);
        const last = new Date(y, m, 0);
        setStartDate(first.toISOString().split('T')[0]);
        setEndDate(last.toISOString().split('T')[0]);
    };

    useEffect(() => {
        supabase.from('stores').select('id, name').order('name').then(r => setStores(r.data || []));
        supabase.from('users').select('id, name').eq('status', 'active').order('name').then(r => setEmployees(r.data || []));
    }, []);

    const loadDashboard = async () => {
        setLoading(true);
        // Load time records within date
        const { data: recordsData } = await supabase
            .from('time_records')
            .select(`
                user_id, total_hours, is_late,
                user:users!inner(name, employee_type, max_hours_per_week, store:stores(name))
            `)
            .gte('clock_in', `${startDate}T00:00:00+08:00`)
            .lte('clock_in', `${endDate}T23:59:59+08:00`)
            .not('total_hours', 'is', null);

        if (!recordsData) {
            setData([]);
            setLoading(false);
            return;
        }

        // Apply filters
        const filtered = recordsData.filter((r: any) => {
            if (selectedStore !== 'all' && r.user.store?.id !== selectedStore && r.store_id !== selectedStore) {
                // Approximate store check (either employee's store or record's store matches)
                if (r.store_id !== selectedStore) return false;
            }
            if (employeeType !== 'all' && r.user.employee_type !== employeeType) return false;
            if (selectedEmployee !== 'all' && r.user_id !== selectedEmployee) return false;
            return true;
        });

        // Calculate days in range for expected hours
        const sDate = new Date(startDate);
        const eDate = new Date(endDate);
        const days = Math.max(1, Math.ceil((eDate.getTime() - sDate.getTime()) / (1000 * 3600 * 24)) + 1);

        // Group by user
        const grouped = new Map<string, EmployeeHours>();

        filtered.forEach((r: any) => {
            const uid = r.user_id;
            if (!grouped.has(uid)) {
                grouped.set(uid, {
                    user_id: uid,
                    name: r.user.name,
                    employee_type: r.user.employee_type,
                    store_name: r.user.store?.name || null,
                    total_hours: 0,
                    expected_hours: (r.user.max_hours_per_week / 7) * days, // Pro-rated max hours
                    records_count: 0,
                    late_count: 0
                });
            }

            const g = grouped.get(uid)!;
            g.total_hours += (r.total_hours || 0);
            g.records_count += 1;
            if (r.is_late) g.late_count += 1;
        });

        const arr = Array.from(grouped.values()).sort((a, b) => b.total_hours - a.total_hours);
        setData(arr);
        setLoading(false);
    };

    const loadAbsenceAlerts = async () => {
        const today = new Date().toISOString().slice(0, 10);
        // Only flag shifts that are strictly in the past (not today — still pending)
        const effectiveTo = endDate < today ? endDate : today > startDate ? (() => {
            const d = new Date(today);
            d.setDate(d.getDate() - 1);
            return d.toISOString().slice(0, 10);
        })() : '';

        if (!effectiveTo || effectiveTo < startDate) {
            setAbsenceAlerts([]);
            return;
        }

        const { data: shiftsData } = await supabase
            .from('shift_assignments')
            .select(`
                id, user_id, date, shift_type, shift_start, shift_end,
                users(name, store_id, stores(name))
            `)
            .gte('date', startDate)
            .lte('date', effectiveTo)
            .not('shift_type', 'in', '("off","day_off","休","休假")')
            .order('date', { ascending: false });

        const { data: clockIns } = await supabase
            .from('time_records')
            .select('user_id, clock_in')
            .gte('clock_in', `${startDate}T00:00:00`)
            .lte('clock_in', `${effectiveTo}T23:59:59`);

        const clockedInSet = new Set(
            (clockIns || []).map((r: any) => `${r.user_id}_${r.clock_in.slice(0, 10)}`)
        );

        const absent = (shiftsData || []).filter((s: any) =>
            !clockedInSet.has(`${s.user_id}_${s.date}`)
        );

        const alerts = absent.map((s: any) => ({
            employee_name: (s.users as any)?.name || s.user_id,
            store_name: (s.users as any)?.stores?.name || '—',
            shift_date: s.date,
            shift_start: s.shift_start || '',
            shift_end: s.shift_end || '',
        }));

        setAbsenceAlerts(alerts);
    };

    useEffect(() => {
        loadDashboard();
        loadAbsenceAlerts();
    }, [startDate, endDate, selectedStore, employeeType, selectedEmployee]);

    const typeLabel: Record<string, string> = { full_time: zh ? '全職' : 'Full-time', part_time: zh ? '兼職' : 'Part-time', contract: zh ? '約聘' : 'Contract' };

    const grandTotal = data.reduce((sum, d) => sum + d.total_hours, 0);
    const totalHeadcount = data.length;

    const exportCSV = () => {
        const headers = ['員工姓名', '員工類型', '門市', '出勤天數', '遲到次數', '實際工時(h)', '預期工時(h)', '差異(h)'];
        const rows = data.map(d => [
            d.name,
            d.employee_type,
            d.store_name || '',
            d.records_count,
            d.late_count,
            d.total_hours.toFixed(2),
            d.expected_hours.toFixed(2),
            (d.total_hours - d.expected_hours).toFixed(2)
        ]);
        const csv = [headers, ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n');
        const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `hr_timesheet_${startDate}_to_${endDate}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    // Risk alert computed lists
    const highHoursAlerts = data.filter(d => d.total_hours > d.expected_hours * 1.2);
    const lateAlerts = data.filter(d => d.records_count > 0 && d.late_count / d.records_count > 0.2);
    const undertimeAlerts = data.filter(d => d.total_hours < d.expected_hours * 0.7);

    const filterControls = (
        <div className="card" style={{ marginBottom: '20px' }}>
            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div>
                    <label className="detail-label">{zh ? '開始日期' : 'Start Date'}</label>
                    <input className="input-field" type="date" name="dateFilter" value={startDate} onChange={e => setStartDate(e.target.value)} />
                </div>
                <div>
                    <label className="detail-label">{zh ? '結束日期' : 'End Date'}</label>
                    <input className="input-field" type="date" name="dateFilter" value={endDate} onChange={e => setEndDate(e.target.value)} />
                </div>
                <div>
                    <label className="detail-label">{zh ? '門市過濾' : 'Store Filter'}</label>
                    <select className="input-field" name="filter" value={selectedStore} onChange={e => setSelectedStore(e.target.value)} style={{ minWidth: '150px' }}>
                        <option value="all">{zh ? '所有門市' : 'All Stores'}</option>
                        {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                </div>
                <div>
                    <label className="detail-label">{zh ? '員工類型' : 'Employee Type'}</label>
                    <select className="input-field" name="filter" value={employeeType} onChange={e => setEmployeeType(e.target.value)} style={{ minWidth: '150px' }}>
                        <option value="all">{zh ? '全部' : 'All'}</option>
                        <option value="full_time">{typeLabel.full_time}</option>
                        <option value="part_time">{typeLabel.part_time}</option>
                        <option value="contract">{typeLabel.contract}</option>
                    </select>
                </div>
                <div>
                    <label className="detail-label">{zh ? '員工過濾' : 'Employee'}</label>
                    <select className="input-field" name="filter" value={selectedEmployee} onChange={e => setSelectedEmployee(e.target.value)} style={{ minWidth: '150px' }}>
                        <option value="all">{zh ? '所有員工' : 'All Employees'}</option>
                        {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                    </select>
                </div>
                <button className="btn btn-primary" onClick={loadDashboard}>{zh ? '重新計算' : 'Recalculate'}</button>
            </div>
        </div>
    );

    const hoursTable = (
        <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
            {loading ? <div style={{ padding: '40px', textAlign: 'center' }}>{zh ? '計算中…' : 'Calculating…'}</div> : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                    <thead>
                        <tr style={{ background: 'var(--bg-primary)' }}>
                            <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, borderBottom: 'none' }}>{zh ? '員工姓名' : 'Employee'}</th>
                            <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, borderBottom: 'none' }}>{zh ? '類型' : 'Type'}</th>
                            <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, borderBottom: 'none' }}>{zh ? '門市' : 'Store'}</th>
                            <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, borderBottom: 'none' }}>{zh ? '出勤天數' : 'Days Worked'}</th>
                            <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, borderBottom: 'none' }}>{zh ? '遲到次數' : 'Late Count'}</th>
                            <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, borderBottom: 'none' }}>{zh ? '區間總工時' : 'Actual Hours'}</th>
                            <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, borderBottom: 'none' }}>{zh ? '參考預期工時' : 'Expected Hours'}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.map(d => (
                            <tr key={d.user_id} style={{ borderBottom: 'none' }}>
                                <td style={{ padding: '12px 16px', fontWeight: 600 }}>{d.name}</td>
                                <td style={{ padding: '12px 16px' }}><span className="badge" style={{ fontSize: '11px' }}>{typeLabel[d.employee_type]}</span></td>
                                <td style={{ padding: '12px 16px', color: 'var(--text-muted)' }}>{d.store_name || '—'}</td>
                                <td style={{ padding: '12px 16px' }}>{d.records_count}</td>
                                <td style={{ padding: '12px 16px' }}>
                                    {d.late_count > 0 ? <span style={{ color: '#f43f5e', fontWeight: 600 }}>{d.late_count}</span> : 0}
                                </td>
                                <td style={{ padding: '12px 16px', fontWeight: 700, color: 'var(--accent-primary)', fontSize: '15px' }}>
                                    {d.total_hours.toFixed(1)}
                                </td>
                                <td style={{ padding: '12px 16px', color: 'var(--text-muted)' }}>
                                    {d.expected_hours.toFixed(1)}
                                    {d.total_hours > d.expected_hours && (
                                        <span style={{ color: '#f59e0b', fontSize: '11px', marginLeft: '6px' }}>
                                            (超時: {(d.total_hours - d.expected_hours).toFixed(1)}h)
                                        </span>
                                    )}
                                </td>
                            </tr>
                        ))}
                        {data.length === 0 && (
                            <tr>
                                <td colSpan={7} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                                    {zh ? '無符合條件的數據' : 'No data for selected filters'}
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            )}
        </div>
    );

    const summaryCards = (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '20px' }}>
            <div className="card" style={{ padding: '20px', textAlign: 'center' }}>
                <div style={{ fontSize: '32px', fontWeight: 700, color: 'var(--accent-primary)' }}>{grandTotal.toFixed(1)} <span style={{ fontSize: '16px' }}>h</span></div>
                <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>{zh ? '區間總工時' : 'Total Hours in Range'}</div>
            </div>
            <div className="card" style={{ padding: '20px', textAlign: 'center' }}>
                <div style={{ fontSize: '32px', fontWeight: 700, color: '#22c55e' }}>{totalHeadcount}</div>
                <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>{zh ? '有紀錄的員工人數' : 'Employees with Records'}</div>
            </div>
            <div className="card" style={{ padding: '20px', textAlign: 'center' }}>
                <div style={{ fontSize: '32px', fontWeight: 700, color: '#f59e0b' }}>{(grandTotal / Math.max(1, totalHeadcount)).toFixed(1)} <span style={{ fontSize: '16px' }}>h</span></div>
                <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>{zh ? '平均每人工時' : 'Avg Hours / Employee'}</div>
            </div>
        </div>
    );

    return (
        <div className="fade-in">
            <div className="page-header">
                <h1>📊 {zh ? 'HR 薪資與工時計算報表' : 'HR Hours Dashboard'}</h1>
                <p className="page-subtitle">{zh ? '依據打卡紀錄計算各員工總工時' : 'Calculate total employee hours based on time records'}</p>
            </div>

            {/* Tab Bar */}
            <div style={{ display: 'flex', gap: '4px', marginBottom: '20px', borderBottom: '2px solid var(--outline-variant)', paddingBottom: '0' }}>
                {([
                    { key: 'report', label: zh ? '工時報表' : 'Hours Report' },
                    { key: 'export', label: zh ? 'CSV 匯出' : 'Payroll Export' },
                    { key: 'risk',   label: zh ? '風險警示' : 'Risk Alerts' },
                ] as { key: 'report' | 'export' | 'risk'; label: string }[]).map(t => (
                    <button
                        key={t.key}
                        onClick={() => setTab(t.key)}
                        style={{
                            padding: '10px 20px',
                            border: 'none',
                            borderBottom: tab === t.key ? '2px solid var(--accent-primary)' : '2px solid transparent',
                            background: 'none',
                            cursor: 'pointer',
                            fontWeight: tab === t.key ? 700 : 400,
                            color: tab === t.key ? 'var(--accent-primary)' : 'var(--text-muted)',
                            fontSize: '14px',
                            marginBottom: '-2px',
                            transition: 'background-color 0.15s, border-color 0.15s, color 0.15s',
                        }}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            {/* Tab 1: Hours Report */}
            {tab === 'report' && (
                <>
                    {filterControls}
                    {summaryCards}
                    {hoursTable}
                </>
            )}

            {/* Tab 2: CSV Export */}
            {tab === 'export' && (
                <>
                    {/* Quick month selector */}
                    <div className="card" style={{ marginBottom: '16px', display: 'flex', alignItems: 'flex-end', gap: '16px', flexWrap: 'wrap' }}>
                        <div>
                            <label className="detail-label">{zh ? '快速選月' : 'Quick Month'}</label>
                            <select
                                className="input-field"
                                style={{ minWidth: '160px' }}
                                defaultValue=""
                                onChange={e => handleQuickMonth(e.target.value)}
                            >
                                <option value="">{zh ? '— 選擇月份 —' : '— Select Month —'}</option>
                                {months.map(m => (
                                    <option key={m.value} value={m.value}>{m.label}</option>
                                ))}
                            </select>
                        </div>
                        <div style={{ color: 'var(--text-muted)', fontSize: '13px', alignSelf: 'center' }}>
                            {zh ? '選擇後自動填入起訖日期' : 'Auto-fills start/end dates'}
                        </div>
                    </div>

                    {filterControls}
                    {summaryCards}
                    {hoursTable}

                    <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'flex-end' }}>
                        <button
                            className="btn btn-primary"
                            onClick={exportCSV}
                            disabled={data.length === 0}
                            style={{ gap: '8px', display: 'flex', alignItems: 'center' }}
                        >
                            ⬇ {zh ? '匯出 CSV' : 'Export CSV'}
                        </button>
                    </div>
                </>
            )}

            {/* Tab 3: Risk Alerts */}
            {tab === 'risk' && (
                <>
                    {filterControls}

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

                        {/* Card 1: High Hours Alert */}
                        <div className="card">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
                                <span style={{ fontSize: '18px' }}>🔴</span>
                                <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700 }}>{zh ? '高工時警示' : 'High Hours Alert'}</h3>
                                <span style={{
                                    background: highHoursAlerts.length > 0 ? '#fee2e2' : '#dcfce7',
                                    color: highHoursAlerts.length > 0 ? '#dc2626' : '#16a34a',
                                    borderRadius: '999px', padding: '2px 10px', fontSize: '12px', fontWeight: 700
                                }}>
                                    {highHoursAlerts.length}
                                </span>
                                <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginLeft: '4px' }}>
                                    {zh ? '實際工時 > 預期工時 120%' : 'Actual hours > 120% of expected'}
                                </span>
                            </div>
                            {highHoursAlerts.length === 0 ? (
                                <div style={{ color: '#16a34a', fontSize: '14px', padding: '12px 0' }}>✅ {zh ? '無異常' : 'No issues found'}</div>
                            ) : (
                                <div style={{ overflowX: 'auto', maxHeight: '260px', overflowY: 'auto' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                                        <thead>
                                            <tr style={{ background: 'var(--bg-primary)' }}>
                                                <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, borderBottom: 'none' }}>{zh ? '姓名' : 'Name'}</th>
                                                <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, borderBottom: 'none' }}>{zh ? '門市' : 'Store'}</th>
                                                <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600, borderBottom: 'none' }}>{zh ? '實際(h)' : 'Actual(h)'}</th>
                                                <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600, borderBottom: 'none' }}>{zh ? '預期(h)' : 'Expected(h)'}</th>
                                                <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600, borderBottom: 'none' }}>{zh ? '超時%' : '% Over'}</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {highHoursAlerts.map(d => {
                                                const pct = d.expected_hours > 0 ? (d.total_hours / d.expected_hours) * 100 : 0;
                                                const isRed = pct > 150;
                                                return (
                                                    <tr key={d.user_id} style={{ borderBottom: 'none' }}>
                                                        <td style={{ padding: '8px 12px', fontWeight: 600 }}>{d.name}</td>
                                                        <td style={{ padding: '8px 12px', color: 'var(--text-muted)' }}>{d.store_name || '—'}</td>
                                                        <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: 'var(--accent-primary)' }}>{d.total_hours.toFixed(1)}</td>
                                                        <td style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--text-muted)' }}>{d.expected_hours.toFixed(1)}</td>
                                                        <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                                                            <span style={{
                                                                background: isRed ? '#fee2e2' : '#fef3c7',
                                                                color: isRed ? '#dc2626' : '#d97706',
                                                                borderRadius: '999px', padding: '2px 8px', fontSize: '11px', fontWeight: 700
                                                            }}>
                                                                {pct.toFixed(0)}%
                                                            </span>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>

                        {/* Card 2: Late Arrival Rate */}
                        <div className="card">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
                                <span style={{ fontSize: '18px' }}>⏰</span>
                                <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700 }}>{zh ? '遲到頻率' : 'Late Arrival Rate'}</h3>
                                <span style={{
                                    background: lateAlerts.length > 0 ? '#fee2e2' : '#dcfce7',
                                    color: lateAlerts.length > 0 ? '#dc2626' : '#16a34a',
                                    borderRadius: '999px', padding: '2px 10px', fontSize: '12px', fontWeight: 700
                                }}>
                                    {lateAlerts.length}
                                </span>
                                <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginLeft: '4px' }}>
                                    {zh ? '遲到次數 > 出勤 20%' : 'Late count > 20% of shifts'}
                                </span>
                            </div>
                            {lateAlerts.length === 0 ? (
                                <div style={{ color: '#16a34a', fontSize: '14px', padding: '12px 0' }}>✅ {zh ? '無異常' : 'No issues found'}</div>
                            ) : (
                                <div style={{ overflowX: 'auto', maxHeight: '260px', overflowY: 'auto' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                                        <thead>
                                            <tr style={{ background: 'var(--bg-primary)' }}>
                                                <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, borderBottom: 'none' }}>{zh ? '姓名' : 'Name'}</th>
                                                <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, borderBottom: 'none' }}>{zh ? '門市' : 'Store'}</th>
                                                <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600, borderBottom: 'none' }}>{zh ? '遲到次數' : 'Late Count'}</th>
                                                <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600, borderBottom: 'none' }}>{zh ? '總出勤' : 'Total Shifts'}</th>
                                                <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600, borderBottom: 'none' }}>{zh ? '遲到率' : 'Late Rate'}</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {lateAlerts.map(d => {
                                                const rate = d.records_count > 0 ? (d.late_count / d.records_count) * 100 : 0;
                                                const isRed = rate > 30;
                                                return (
                                                    <tr key={d.user_id} style={{ borderBottom: 'none' }}>
                                                        <td style={{ padding: '8px 12px', fontWeight: 600 }}>{d.name}</td>
                                                        <td style={{ padding: '8px 12px', color: 'var(--text-muted)' }}>{d.store_name || '—'}</td>
                                                        <td style={{ padding: '8px 12px', textAlign: 'right', color: '#f43f5e', fontWeight: 700 }}>{d.late_count}</td>
                                                        <td style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--text-muted)' }}>{d.records_count}</td>
                                                        <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                                                            <span style={{
                                                                background: isRed ? '#fee2e2' : '#fef3c7',
                                                                color: isRed ? '#dc2626' : '#d97706',
                                                                borderRadius: '999px', padding: '2px 8px', fontSize: '11px', fontWeight: 700
                                                            }}>
                                                                {rate.toFixed(0)}%
                                                            </span>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>

                        {/* Card 3: Undertime Alert */}
                        <div className="card">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
                                <span style={{ fontSize: '18px' }}>📉</span>
                                <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700 }}>{zh ? '工時不足警示' : 'Undertime Alert'}</h3>
                                <span style={{
                                    background: undertimeAlerts.length > 0 ? '#fee2e2' : '#dcfce7',
                                    color: undertimeAlerts.length > 0 ? '#dc2626' : '#16a34a',
                                    borderRadius: '999px', padding: '2px 10px', fontSize: '12px', fontWeight: 700
                                }}>
                                    {undertimeAlerts.length}
                                </span>
                                <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginLeft: '4px' }}>
                                    {zh ? '實際工時 < 預期工時 70%' : 'Actual hours < 70% of expected'}
                                </span>
                            </div>
                            {undertimeAlerts.length === 0 ? (
                                <div style={{ color: '#16a34a', fontSize: '14px', padding: '12px 0' }}>✅ {zh ? '無異常' : 'No issues found'}</div>
                            ) : (
                                <div style={{ overflowX: 'auto', maxHeight: '260px', overflowY: 'auto' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                                        <thead>
                                            <tr style={{ background: 'var(--bg-primary)' }}>
                                                <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, borderBottom: 'none' }}>{zh ? '姓名' : 'Name'}</th>
                                                <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, borderBottom: 'none' }}>{zh ? '門市' : 'Store'}</th>
                                                <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600, borderBottom: 'none' }}>{zh ? '實際(h)' : 'Actual(h)'}</th>
                                                <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600, borderBottom: 'none' }}>{zh ? '預期(h)' : 'Expected(h)'}</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {undertimeAlerts.map(d => (
                                                <tr key={d.user_id} style={{ borderBottom: 'none' }}>
                                                    <td style={{ padding: '8px 12px', fontWeight: 600 }}>{d.name}</td>
                                                    <td style={{ padding: '8px 12px', color: 'var(--text-muted)' }}>{d.store_name || '—'}</td>
                                                    <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: '#f43f5e' }}>{d.total_hours.toFixed(1)}</td>
                                                    <td style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--text-muted)' }}>{d.expected_hours.toFixed(1)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>

                        {/* Card 4: Absence Risk */}
                        <div className="card" style={{ marginBottom: '1rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                                <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    🚫 {zh ? '曠職風險' : 'Absence Risk'}
                                </h3>
                                <span style={{ background: absenceAlerts.length > 0 ? '#ef4444' : '#10b981', color: 'white', borderRadius: '12px', padding: '2px 10px', fontSize: '13px' }}>
                                    {absenceAlerts.length}
                                </span>
                            </div>
                            {absenceAlerts.length === 0 ? (
                                <p style={{ color: '#10b981', margin: 0 }}>✅ {zh ? '本期無曠職紀錄' : 'No absences this period'}</p>
                            ) : (
                                <div style={{ overflowX: 'auto', maxHeight: '260px', overflowY: 'auto' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                                        <thead>
                                            <tr style={{ background: '#fef2f2' }}>
                                                <th style={{ padding: '6px 8px', textAlign: 'left', borderBottom: '1px solid var(--outline-variant)' }}>{zh ? '員工' : 'Employee'}</th>
                                                <th style={{ padding: '6px 8px', textAlign: 'left', borderBottom: '1px solid var(--outline-variant)' }}>{zh ? '門市' : 'Store'}</th>
                                                <th style={{ padding: '6px 8px', textAlign: 'left', borderBottom: '1px solid var(--outline-variant)' }}>{zh ? '日期' : 'Date'}</th>
                                                <th style={{ padding: '6px 8px', textAlign: 'left', borderBottom: '1px solid var(--outline-variant)' }}>{zh ? '班別' : 'Shift'}</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {absenceAlerts.map((a, i) => (
                                                <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                                                    <td style={{ padding: '6px 8px', borderBottom: 'none' }}>{a.employee_name}</td>
                                                    <td style={{ padding: '6px 8px', borderBottom: 'none' }}>{a.store_name}</td>
                                                    <td style={{ padding: '6px 8px', borderBottom: 'none' }}>{a.shift_date}</td>
                                                    <td style={{ padding: '6px 8px', borderBottom: 'none' }}>
                                                        {a.shift_start && a.shift_end ? `${a.shift_start}–${a.shift_end}` : a.shift_start || '—'}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>

                    </div>
                </>
            )}
        </div>
    );
}
