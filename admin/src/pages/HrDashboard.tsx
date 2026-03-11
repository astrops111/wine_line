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

    useEffect(() => {
        loadDashboard();
    }, [startDate, endDate, selectedStore, employeeType, selectedEmployee]);

    const typeLabel: Record<string, string> = { full_time: zh ? '全職' : 'Full-time', part_time: zh ? '兼職' : 'Part-time', contract: zh ? '約聘' : 'Contract' };

    const grandTotal = data.reduce((sum, d) => sum + d.total_hours, 0);
    const totalHeadcount = data.length;

    return (
        <div className="fade-in">
            <div className="page-header">
                <h1>📊 {zh ? 'HR 薪資與工時計算報表' : 'HR Hours Dashboard'}</h1>
                <p className="page-subtitle">{zh ? '依據打卡紀錄計算各員工總工時' : 'Calculate total employee hours based on time records'}</p>
            </div>

            <div className="card" style={{ marginBottom: '20px' }}>
                <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                    <div>
                        <label className="detail-label">{zh ? '開始日期' : 'Start Date'}</label>
                        <input className="input-field" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
                    </div>
                    <div>
                        <label className="detail-label">{zh ? '結束日期' : 'End Date'}</label>
                        <input className="input-field" type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
                    </div>
                    <div>
                        <label className="detail-label">{zh ? '門市過濾' : 'Store Filter'}</label>
                        <select className="input-field" value={selectedStore} onChange={e => setSelectedStore(e.target.value)} style={{ minWidth: '150px' }}>
                            <option value="all">{zh ? '所有門市' : 'All Stores'}</option>
                            {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="detail-label">{zh ? '員工類型' : 'Employee Type'}</label>
                        <select className="input-field" value={employeeType} onChange={e => setEmployeeType(e.target.value)} style={{ minWidth: '150px' }}>
                            <option value="all">{zh ? '全部' : 'All'}</option>
                            <option value="full_time">{typeLabel.full_time}</option>
                            <option value="part_time">{typeLabel.part_time}</option>
                            <option value="contract">{typeLabel.contract}</option>
                        </select>
                    </div>
                    <div>
                        <label className="detail-label">{zh ? '員工過濾' : 'Employee'}</label>
                        <select className="input-field" value={selectedEmployee} onChange={e => setSelectedEmployee(e.target.value)} style={{ minWidth: '150px' }}>
                            <option value="all">{zh ? '所有員工' : 'All Employees'}</option>
                            {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                        </select>
                    </div>
                    <button className="btn btn-primary" onClick={loadDashboard}>{zh ? '重新計算' : 'Recalculate'}</button>
                </div>
            </div>

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

            <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
                {loading ? <div style={{ padding: '40px', textAlign: 'center' }}>{zh ? '計算中...' : 'Calculating...'}</div> : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                        <thead>
                            <tr style={{ background: 'var(--bg-primary)' }}>
                                <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, borderBottom: '1px solid var(--border-subtle)' }}>{zh ? '員工姓名' : 'Employee'}</th>
                                <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, borderBottom: '1px solid var(--border-subtle)' }}>{zh ? '類型' : 'Type'}</th>
                                <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, borderBottom: '1px solid var(--border-subtle)' }}>{zh ? '門市' : 'Store'}</th>
                                <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, borderBottom: '1px solid var(--border-subtle)' }}>{zh ? '出勤天數' : 'Days Worked'}</th>
                                <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, borderBottom: '1px solid var(--border-subtle)' }}>{zh ? '遲到次數' : 'Late Count'}</th>
                                <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, borderBottom: '1px solid var(--border-subtle)' }}>{zh ? '區間總工時' : 'Actual Hours'}</th>
                                <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, borderBottom: '1px solid var(--border-subtle)' }}>{zh ? '參考預期工時' : 'Expected Hours'}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.map(d => (
                                <tr key={d.user_id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
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
        </div>
    );
}
