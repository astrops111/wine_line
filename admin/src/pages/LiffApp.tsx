import { useState, useEffect } from 'react';
import liff from '@line/liff';
import { supabase } from '../lib/supabase';
import { Calendar, Clock, Settings, Plane, MapPin, FileText } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { zhTW } from 'date-fns/locale';
import { getCurrentPosition, haversineDistance } from '../lib/geo';

interface PayslipRecord {
  id: string;
  pay_period: string;
  gross_salary: number;
  net_salary: number;
  total_deductions: number;
  base_salary: number;
  role_allowance: number;
  meal_allowance: number;
  transport_allowance: number;
  attendance_bonus_earned: number;
  overtime_pay: number;
  other_bonus: number;
  year_end_bonus: number;
  leave_deduction: number;
  late_deduction: number;
  late_minutes: number;
  labor_ins_employee: number;
  health_ins_employee: number;
  income_tax_withheld: number;
  hours_worked: number;
  leave_days_deducted: number;
}

const getClientIp = async (): Promise<string | null> => {
  try {
    const res = await fetch('https://api.ipify.org?format=json');
    const json = await res.json();
    return json.ip as string;
  } catch {
    return null;
  }
};

export function LiffApp() {
    const [liffId] = useState('YOUR_LIFF_ID'); // Replace later when deploying
    const [userProfile, setUserProfile] = useState<any>(null);
    const [employeeId, setEmployeeId] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState('schedule');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Data states
    const [shifts, setShifts] = useState<any[]>([]);
    const [timeRecords, setTimeRecords] = useState<any[]>([]);
    const [availabilities, setAvailabilities] = useState<any[]>([]);
    const [shiftTemplates, setShiftTemplates] = useState<any[]>([]);
    const [leaveRequests, setLeaveRequests] = useState<any[]>([]);
    const [loadingData, setLoadingData] = useState(false);

    // GPS Clock-In state
    const [clockInStatus, setClockInStatus] = useState<'idle' | 'locating' | 'success' | 'error' | 'out_of_range'>('idle');
    const [clockInMessage, setClockInMessage] = useState('');
    const [storeGpsConfig, setStoreGpsConfig] = useState<{ gps_lat: number | null; gps_lng: number | null; gps_radius_m: number; clock_in_method: string; id: string; name: string; wifi_allowed_ips: string[] } | null>(null);
    const [userStoreId, setUserStoreId] = useState<string | null>(null);
    // Punch Correction state
    const [showCorrectionForm, setShowCorrectionForm] = useState<string | null>(null); // time_record_id being corrected, or 'new' for missing
    const [correctionData, setCorrectionData] = useState({ requested_clock_in: '', requested_clock_out: '', reason: '', correction_type: 'both' });
    const [correctionSubmitting, setCorrectionSubmitting] = useState(false);
    // Leave Request state
    const [showLeaveForm, setShowLeaveForm] = useState(false);
    const [leaveForm, setLeaveForm] = useState({ leave_type: 'annual', start_date: new Date().toISOString().split('T')[0], end_date: new Date().toISOString().split('T')[0], reason: '' });
    const [leaveBalance, setLeaveBalance] = useState<any>(null);
    const [leaveSubmitting, setLeaveSubmitting] = useState(false);

    const [payslips, setPayslips] = useState<PayslipRecord[]>([]);
    const [selectedPayslip, setSelectedPayslip] = useState<PayslipRecord | null>(null);
    const [payslipsLoading, setPayslipsLoading] = useState(false);
    const [payslipUnlocked, setPayslipUnlocked] = useState(false);
    const [payslipPin, setPayslipPin] = useState('');
    const [pinError, setPinError] = useState('');

    useEffect(() => {
        const initLiff = async () => {
            try {
                await liff.init({ liffId });
                if (liff.isLoggedIn()) {
                    const profile = await liff.getProfile();
                    setUserProfile(profile);
                    await lookupEmployee(profile.userId);
                } else {
                    // Start login process if not logged in
                    liff.login();
                }
            } catch (err: any) {
                console.error('LIFF Init Error:', err);
                setError('Failed to initialize LIFF application.');
                setLoading(false);
            }
        };

        // For local development testing, mock the LIFF user
        if (import.meta.env.DEV) {
            const mockLineId = 'U_MOCK_LINE_ID'; // Change to match a real test mapping
            setUserProfile({ displayName: 'Test User', userId: mockLineId });
            lookupEmployee(mockLineId);
        } else {
            initLiff();
        }
    }, [liffId]);

    const lookupEmployee = async (lineUserId: string) => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('line_employee_mapping')
                .select('user_id')
                .eq('line_user_id', lineUserId)
                .single();

            if (error || !data) {
                setError('Your LINE account is not linked to an employee profile.');
                setEmployeeId(null);
            } else if (data) {
                setEmployeeId(data.user_id);
                loadShifts(data.user_id);
                loadTimeRecords(data.user_id);
                loadAvailabilities(data.user_id);
                loadShiftTemplates();
                loadLeaveRequests(data.user_id);
                loadStoreConfig(data.user_id);
                loadPayslips(data.user_id);
            }
        } catch (err) {
            console.error(err);
            setError('Error verifying employee credentials.');
        } finally {
            setLoading(false);
        }
    };

    const loadShifts = async (empId: string) => {
        setLoadingData(true);
        try {
            const today = new Date().toISOString().split('T')[0];
            const { data, error } = await supabase
                .from('shift_assignments')
                .select(`
                    id,
                    date,
                    start_time,
                    end_time,
                    status,
                    stores ( name ),
                    shift_templates ( name )
                `)
                .eq('user_id', empId)
                .gte('date', today)
                .in('status', ['published', 'acknowledged'])
                .order('date', { ascending: true })
                .limit(14); // Next 14 shifts

            if (error) throw error;
            setShifts(data || []);
        } catch (err: any) {
            console.error('Error loading shifts:', err.message);
        } finally {
            setLoadingData(false);
            setLoadingData(false);
        }
    };

    const loadTimeRecords = async (empId: string) => {
        try {
            const today = new Date();
            const startOfWeekDate = new Date(today);
            startOfWeekDate.setDate(today.getDate() - today.getDay());
            const startStr = startOfWeekDate.toISOString().split('T')[0];

            const { data, error } = await supabase
                .from('time_records')
                .select(`
                    id,
                    clock_in,
                    clock_out,
                    is_late,
                    total_hours,
                    stores ( name )
                `)
                .eq('user_id', empId)
                .gte('clock_in', startStr)
                .order('clock_in', { ascending: false });

            if (error) throw error;
            setTimeRecords(data || []);
        } catch (err: any) {
            console.error('Error loading time records:', err.message);
        }
    };

    const loadAvailabilities = async (empId: string) => {
        try {
            const { data, error } = await supabase
                .from('employee_availability')
                .select('*')
                .eq('user_id', empId)
                .order('day_of_week');

            if (error) throw error;
            setAvailabilities(data || []);
        } catch (err: any) {
            console.error('Error loading availabilities:', err.message);
        }
    };

    const loadShiftTemplates = async () => {
        try {
            const { data, error } = await supabase
                .from('shift_templates')
                .select('*')
                .order('start_time');
            if (error) throw error;
            setShiftTemplates(data || []);
        } catch (err: any) {
            console.error('Error loading shift templates:', err.message);
        }
    };

    const loadLeaveRequests = async (empId: string) => {
        try {
            const { data, error } = await supabase
                .from('leave_requests')
                .select('*')
                .eq('user_id', empId)
                .order('start_date', { ascending: false });

            if (error) throw error;
            setLeaveRequests(data || []);
        } catch (err: any) {
            console.error('Error loading leave requests:', err.message);
        }
    };

    const loadStoreConfig = async (empId: string) => {
        try {
            const { data: userRow } = await supabase
                .from('users')
                .select('store_id, stores(id, name, gps_lat, gps_lng, gps_radius_m, clock_in_method, wifi_allowed_ips)')
                .eq('id', empId)
                .single();
            if (userRow?.store_id) {
                setUserStoreId(userRow.store_id);
                const store = (userRow as any).stores;
                if (store) setStoreGpsConfig({ ...store, wifi_allowed_ips: store.wifi_allowed_ips ?? [] });
            }
        } catch (err) {
            console.error('Error loading store config:', err);
        }
    };

    const loadPayslips = async (empId: string) => {
        setPayslipsLoading(true);
        try {
            const { data } = await supabase
                .from('payroll_records')
                .select('id, pay_period, gross_salary, net_salary, total_deductions, base_salary, role_allowance, meal_allowance, transport_allowance, attendance_bonus_earned, overtime_pay, other_bonus, year_end_bonus, leave_deduction, late_deduction, late_minutes, labor_ins_employee, health_ins_employee, income_tax_withheld, hours_worked, leave_days_deducted')
                .eq('user_id', empId)
                .order('pay_period', { ascending: false })
                .limit(12);
            setPayslips(data || []);
        } catch (err) {
            console.error('Error loading payslips:', err);
        } finally {
            setPayslipsLoading(false);
        }
    };

    const handleGpsClockIn = async () => {
        if (!employeeId) return;
        setClockInStatus('locating');
        setClockInMessage('');

        const method = storeGpsConfig?.clock_in_method ?? 'open';
        const wifiAllowedIps = storeGpsConfig?.wifi_allowed_ips ?? [];

        // Helper: perform the actual DB write
        const doClockRecord = async (
            userLat: number | null,
            userLng: number | null,
            distanceM: number | null,
            clockInMethod: string,
        ) => {
            const today = new Date().toISOString().split('T')[0];
            const { data: existing } = await supabase
                .from('time_records')
                .select('id, clock_in, clock_out')
                .eq('user_id', employeeId)
                .gte('clock_in', today)
                .is('clock_out', null)
                .maybeSingle();

            if (existing) {
                const { error } = await supabase.from('time_records').update({
                    clock_out: new Date().toISOString(),
                    clock_in_lat: userLat,
                    clock_in_lng: userLng,
                    clock_in_distance_m: distanceM,
                    clock_in_method: clockInMethod,
                }).eq('id', existing.id);
                if (error) throw error;
                setClockInStatus('success');
                setClockInMessage('✅ 打卡退出成功！');
            } else {
                const { error } = await supabase.from('time_records').insert({
                    user_id: employeeId,
                    store_id: userStoreId,
                    clock_in: new Date().toISOString(),
                    is_late: false,
                    clock_in_lat: userLat,
                    clock_in_lng: userLng,
                    clock_in_distance_m: distanceM,
                    clock_in_method: clockInMethod,
                });
                if (error) throw error;
                setClockInStatus('success');
                if (clockInMethod === 'wifi') {
                    setClockInMessage('✅ 打卡成功！（WiFi 驗證）');
                } else if (clockInMethod === 'gps') {
                    setClockInMessage(`✅ 打卡成功！距門市 ${distanceM ?? '?'}m`);
                } else {
                    setClockInMessage('✅ 打卡成功！');
                }
            }
            await loadTimeRecords(employeeId);
            setTimeout(() => setClockInStatus('idle'), 3000);
        };

        try {
            if (method === 'wifi') {
                // WiFi-only: skip GPS entirely
                const ip = await getClientIp();
                if (!ip || !wifiAllowedIps.includes(ip)) {
                    setClockInStatus('out_of_range');
                    setClockInMessage('未連接門市 WiFi 網路');
                    return;
                }
                await doClockRecord(null, null, null, 'wifi');

            } else if (method === 'gps_required') {
                // GPS required — existing behavior
                const position = await getCurrentPosition();
                const { latitude: userLat, longitude: userLng } = position.coords;
                let distanceM: number | null = null;
                let withinRange = true;
                if (storeGpsConfig?.gps_lat && storeGpsConfig?.gps_lng) {
                    distanceM = Math.round(haversineDistance(userLat, userLng, storeGpsConfig.gps_lat, storeGpsConfig.gps_lng));
                    withinRange = distanceM <= (storeGpsConfig.gps_radius_m || 200);
                }
                if (!withinRange) {
                    setClockInStatus('out_of_range');
                    setClockInMessage(`距離門市 ${distanceM}m，超出允許範圍 ${storeGpsConfig?.gps_radius_m || 200}m`);
                    return;
                }
                await doClockRecord(userLat, userLng, distanceM, 'gps');

            } else if (method === 'gps_or_wifi') {
                // GPS first, fall back to WiFi
                const position = await getCurrentPosition();
                const { latitude: userLat, longitude: userLng } = position.coords;
                let distanceM: number | null = null;
                let withinRange = true;
                if (storeGpsConfig?.gps_lat && storeGpsConfig?.gps_lng) {
                    distanceM = Math.round(haversineDistance(userLat, userLng, storeGpsConfig.gps_lat, storeGpsConfig.gps_lng));
                    withinRange = distanceM <= (storeGpsConfig.gps_radius_m || 200);
                }
                if (withinRange) {
                    await doClockRecord(userLat, userLng, distanceM, 'gps');
                } else {
                    // Out of GPS range — try WiFi
                    const ip = await getClientIp();
                    if (ip && wifiAllowedIps.includes(ip)) {
                        await doClockRecord(userLat, userLng, distanceM, 'wifi');
                    } else {
                        setClockInStatus('out_of_range');
                        setClockInMessage(`距離門市 ${distanceM}m，且未連接門市 WiFi`);
                    }
                }

            } else {
                // 'open' or no config — manual clock in
                const position = await getCurrentPosition().catch(() => null);
                const userLat = position?.coords.latitude ?? null;
                const userLng = position?.coords.longitude ?? null;
                let distanceM: number | null = null;
                if (userLat !== null && userLng !== null && storeGpsConfig?.gps_lat && storeGpsConfig?.gps_lng) {
                    distanceM = Math.round(haversineDistance(userLat, userLng, storeGpsConfig.gps_lat, storeGpsConfig.gps_lng));
                }
                await doClockRecord(userLat, userLng, distanceM, 'manual');
            }
        } catch (err: any) {
            setClockInStatus('error');
            setClockInMessage(err.code === 1 ? '位置存取被拒絕，請允許定位權限。' : `定位失敗：${err.message}`);
        }
    };

    const submitCorrection = async (timeRecordId: string | null) => {
        if (!employeeId || !correctionData.reason) return;
        setCorrectionSubmitting(true);
        try {
            const record = timeRecordId ? timeRecords.find(r => r.id === timeRecordId) : null;
            await supabase.from('punch_corrections').insert({
                user_id: employeeId,
                store_id: userStoreId,
                time_record_id: timeRecordId,
                correction_type: correctionData.correction_type,
                original_clock_in: record?.clock_in || null,
                original_clock_out: record?.clock_out || null,
                requested_clock_in: correctionData.requested_clock_in || null,
                requested_clock_out: correctionData.requested_clock_out || null,
                reason: correctionData.reason,
                status: 'pending',
            });
            setShowCorrectionForm(null);
            setCorrectionData({ requested_clock_in: '', requested_clock_out: '', reason: '', correction_type: 'both' });
            alert('更正申請已提交，待主管審核。');
        } catch (err: any) {
            alert(`提交失敗：${err.message}`);
        } finally {
            setCorrectionSubmitting(false);
        }
    };

    const daysOfWeek = [
        { id: 0, zh: '週日', en: 'Sunday' },
        { id: 1, zh: '週一', en: 'Monday' },
        { id: 2, zh: '週二', en: 'Tuesday' },
        { id: 3, zh: '週三', en: 'Wednesday' },
        { id: 4, zh: '週四', en: 'Thursday' },
        { id: 5, zh: '週五', en: 'Friday' },
        { id: 6, zh: '週六', en: 'Saturday' },
    ];

    const availLabel = (val: string) => {
        switch (val) {
            case 'available': return '可排班';
            case 'preferred': return '偏好排班';
            case 'unavailable': return '不可排班';
            default: return val;
        }
    };

    const availColor = (val: string) => {
        switch (val) {
            case 'available': return 'bg-green-100 text-green-800 border-green-200';
            case 'preferred': return 'bg-indigo-100 text-indigo-800 border-indigo-200';
            case 'unavailable': return 'bg-red-100 text-red-800 border-red-200';
            default: return 'bg-gray-100 text-gray-800 border-gray-200';
        }
    };

    if (loading) {
        return <div className="min-h-screen flex items-center justify-center bg-gray-50 text-gray-500">Loading...</div>;
    }

    if (error || !employeeId) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center bg-gray-50">
                <div className="text-red-500 mb-4 text-4xl">⚠️</div>
                <h1 className="text-xl font-bold mb-2">Access Denied</h1>
                <p className="text-gray-600 mb-6">{error || 'Please contact your manager to link your LINE account.'}</p>
                {import.meta.env.DEV && (
                    <div className="text-xs bg-gray-200 p-2 rounded text-left overflow-auto max-w-full">
                        Debug: Mock Line ID used: U_MOCK_LINE_ID
                    </div>
                )}
            </div>
        );
    }

    const loadLeaveBalance = async (empId: string, leaveType: string, year: number) => {
        const { data } = await supabase
            .from('leave_balances')
            .select('total_days, used_days, carry_over_days')
            .eq('user_id', empId).eq('year', year).eq('leave_type', leaveType)
            .maybeSingle();
        setLeaveBalance(data);
    };

    const submitLeaveRequest = async () => {
        if (!employeeId || !leaveForm.start_date || !leaveForm.end_date || !leaveForm.reason) return;
        setLeaveSubmitting(true);
        try {
            const start = new Date(leaveForm.start_date);
            const end = new Date(leaveForm.end_date);
            const totalDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1);
            const { data, error } = await supabase.from('leave_requests').insert({
                user_id: employeeId,
                store_id: userStoreId,
                start_date: leaveForm.start_date,
                end_date: leaveForm.end_date,
                leave_type: leaveForm.leave_type,
                reason: leaveForm.reason,
                status: 'pending',
                total_days: totalDays,
                is_paid: leaveForm.leave_type !== 'unpaid',
            }).select().single();
            if (error) throw error;
            
            // Notify manager via hr-notify
            if (data?.id) {
                try {
                    await fetch(`${import.meta.env.VITE_SUPABASE_FUNCTIONS_URL}/hr-notify`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            user_id: employeeId,
                            type: 'leave_submitted',
                            details: {
                                leave_id: data.id,
                                leave_type: leaveForm.leave_type,
                                start_date: leaveForm.start_date,
                                end_date: leaveForm.end_date,
                                total_days: totalDays,
                                reason: leaveForm.reason
                            }
                        })
                    });
                } catch (err) {
                    console.error('Failed to notify manager:', err);
                }
            }

            setShowLeaveForm(false);
            setLeaveBalance(null);
            setLeaveForm({ leave_type: 'annual', start_date: new Date().toISOString().split('T')[0], end_date: new Date().toISOString().split('T')[0], reason: '' });
            await loadLeaveRequests(employeeId);
            alert('請假申請已提交！等待主管審核。');
        } catch (err: any) {
            alert(`提交失敗：${err.message}`);
        } finally {
            setLeaveSubmitting(false);
        }
    };

    const renderClockIn = () => (
        <div className="p-4 space-y-4">
            <h2 className="text-lg font-bold text-gray-800 mb-2">GPS 打卡</h2>

            {storeGpsConfig && (
                <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-600 border border-gray-200">
                    <div className="font-medium text-gray-800">{storeGpsConfig.name}</div>
                    {storeGpsConfig.gps_lat && (
                        <div className="mt-1 text-xs text-gray-500">
                            允許範圍：{storeGpsConfig.gps_radius_m || 200}m
                        </div>
                    )}
                    {!storeGpsConfig.gps_lat && (
                        <div className="text-xs text-amber-600 mt-1">⚠️ 此門市尚未設定 GPS 座標（手動打卡模式）</div>
                    )}
                </div>
            )}

            <button
                onClick={handleGpsClockIn}
                disabled={clockInStatus === 'locating'}
                className={`w-full py-6 rounded-2xl text-white text-xl font-bold shadow-lg transition-colors ${
                    clockInStatus === 'locating'
                        ? 'bg-gray-400 cursor-not-allowed'
                        : clockInStatus === 'success'
                        ? 'bg-green-500'
                        : clockInStatus === 'error' || clockInStatus === 'out_of_range'
                        ? 'bg-red-500'
                        : 'bg-indigo-600 active:scale-95'
                }`}
            >
                {clockInStatus === 'locating' ? '定位中…' :
                 clockInStatus === 'success' ? '打卡完成 ✓' :
                 clockInStatus === 'error' ? '打卡失敗' :
                 clockInStatus === 'out_of_range' ? (storeGpsConfig?.clock_in_method === 'wifi' ? '未連接 WiFi' : '超出範圍') :
                 '打卡'}
            </button>

            {clockInMessage && (
                <div className={`rounded-lg p-3 text-sm text-center font-medium ${
                    clockInStatus === 'success' ? 'bg-green-50 text-green-700'
                    : clockInStatus === 'out_of_range' ? 'bg-amber-50 text-amber-700'
                    : 'bg-red-50 text-red-700'
                }`}>
                    {clockInMessage}
                </div>
            )}

            {clockInStatus === 'out_of_range' && (
                <button
                    className="w-full py-3 border border-gray-300 rounded-xl text-sm text-gray-600"
                    onClick={() => {
                        setShowCorrectionForm('new');
                        setCorrectionData({ ...correctionData, correction_type: 'missing', requested_clock_in: new Date().toISOString().slice(0, 16) });
                    }}
                >
                    📝 提交人工補打申請
                </button>
            )}

            {/* Today's Records Summary */}
            <div>
                <h3 className="text-sm font-semibold text-gray-600 mb-2">今日打卡記錄</h3>
                {timeRecords.slice(0, 3).map(record => (
                    <div key={record.id} className="bg-white rounded-lg p-3 shadow-sm mb-2 flex justify-between items-center">
                        <div>
                            <div className="text-sm font-medium">
                                {record.clock_in ? format(parseISO(record.clock_in), 'HH:mm') : '--:--'}
                                {' → '}
                                {record.clock_out ? format(parseISO(record.clock_out), 'HH:mm') : '進行中'}
                            </div>
                            <div className="text-xs text-gray-500">{record.stores?.name}</div>
                        </div>
                        <span className={`text-xs px-2 py-1 rounded-full ${record.is_late ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                            {record.is_late ? '遲到' : '正常'}
                        </span>
                    </div>
                ))}
            </div>

            {/* Punch Correction Form */}
            {showCorrectionForm && (
                <div className="bg-white rounded-xl shadow p-4 border border-indigo-200">
                    <h3 className="font-bold text-gray-800 mb-3">📝 打卡更正申請</h3>
                    <div className="space-y-3">
                        <div>
                            <label className="text-xs text-gray-500">申請類型</label>
                            <select
                                className="w-full mt-1 border rounded-lg p-2 text-sm"
                                value={correctionData.correction_type}
                                onChange={e => setCorrectionData({ ...correctionData, correction_type: e.target.value })}
                            >
                                <option value="both">上下班均更正</option>
                                <option value="clock_in">僅更正上班時間</option>
                                <option value="clock_out">僅更正下班時間</option>
                                <option value="missing">補登打卡</option>
                            </select>
                        </div>
                        {(correctionData.correction_type === 'clock_in' || correctionData.correction_type === 'both' || correctionData.correction_type === 'missing') && (
                            <div>
                                <label className="text-xs text-gray-500">申請上班時間</label>
                                <input type="datetime-local" className="w-full mt-1 border rounded-lg p-2 text-sm"
                                    value={correctionData.requested_clock_in}
                                    onChange={e => setCorrectionData({ ...correctionData, requested_clock_in: e.target.value })} />
                            </div>
                        )}
                        {(correctionData.correction_type === 'clock_out' || correctionData.correction_type === 'both' || correctionData.correction_type === 'missing') && (
                            <div>
                                <label className="text-xs text-gray-500">申請下班時間</label>
                                <input type="datetime-local" className="w-full mt-1 border rounded-lg p-2 text-sm"
                                    value={correctionData.requested_clock_out}
                                    onChange={e => setCorrectionData({ ...correctionData, requested_clock_out: e.target.value })} />
                            </div>
                        )}
                        <div>
                            <label className="text-xs text-gray-500">原因說明 *</label>
                            <textarea className="w-full mt-1 border rounded-lg p-2 text-sm" rows={3} placeholder="請說明更正原因…"
                                value={correctionData.reason}
                                onChange={e => setCorrectionData({ ...correctionData, reason: e.target.value })} />
                        </div>
                        <div className="flex gap-2">
                            <button
                                className="flex-1 bg-indigo-600 text-white py-2 rounded-lg text-sm font-medium disabled:opacity-50"
                                disabled={correctionSubmitting || !correctionData.reason}
                                onClick={() => submitCorrection(showCorrectionForm === 'new' ? null : showCorrectionForm)}
                            >
                                {correctionSubmitting ? '提交中…' : '提交申請'}
                            </button>
                            <button className="px-4 border rounded-lg text-sm text-gray-600"
                                onClick={() => { setShowCorrectionForm(null); setCorrectionData({ requested_clock_in: '', requested_clock_out: '', reason: '', correction_type: 'both' }); }}>
                                取消
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );

    const renderSchedule = () => (
        <div className="p-4 space-y-4">
            <h2 className="text-lg font-bold text-gray-800 mb-4">近期班表</h2>
            {loadingData ? (
                <div className="text-center text-gray-500 py-8">載入中...</div>
            ) : shifts.length === 0 ? (
                <div className="text-center bg-white rounded-lg shadow p-6 text-gray-500">
                    <Calendar className="mx-auto h-12 w-12 text-gray-300 mb-2" aria-hidden="true" />
                    <p>目前沒有近期排班</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {shifts.map(shift => (
                        <div key={shift.id} className="bg-white rounded-lg shadow p-4 border-l-4 border-indigo-500">
                            <div className="flex justify-between items-start mb-2">
                                <div>
                                    <div className="font-bold text-gray-800 text-lg">
                                        {format(parseISO(shift.date), 'MM/dd (E)', { locale: zhTW })}
                                    </div>
                                    <div className="text-sm font-medium text-indigo-600 mt-1">
                                        {shift.start_time.substring(0, 5)} - {shift.end_time.substring(0, 5)}
                                    </div>
                                </div>
                                <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-green-100 text-green-800">
                                    {shift.status === 'published' ? '已發布' : '已確認'}
                                </span>
                            </div>
                            <div className="flex items-center text-sm text-gray-500 mt-2">
                                <MapPin size={14} className="mr-1" aria-hidden="true" />
                                {shift.stores?.name}
                                {shift.shift_templates?.name && (
                                    <span className="ml-2 px-1.5 py-0.5 bg-gray-100 rounded text-xs">
                                        {shift.shift_templates.name}
                                    </span>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );

    const renderHours = () => {
        const totalHours = timeRecords.reduce((sum, r) => sum + (r.total_hours || 0), 0);

        return (
            <div className="p-4 space-y-4">
                <div className="bg-indigo-600 rounded-xl p-6 text-white shadow-md">
                    <h2 className="text-indigo-100 font-medium mb-1">本週累積工時</h2>
                    <div className="text-4xl font-bold">{totalHours.toFixed(1)} <span className="text-lg font-normal">小時</span></div>
                </div>

                <h3 className="text-lg font-bold text-gray-800 mt-6 mb-4">打卡紀錄</h3>
                {timeRecords.length === 0 ? (
                    <div className="text-center bg-white rounded-lg shadow p-6 text-gray-500">
                        <p>本週尚無打卡紀錄</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {timeRecords.map(record => (
                            <div key={record.id} className="bg-white rounded-lg shadow p-4">
                                <div className="flex justify-between items-start mb-2">
                                    <div className="font-medium text-gray-800">
                                        {format(parseISO(record.clock_in), 'MM/dd (E)', { locale: zhTW })}
                                    </div>
                                    <div className="text-right">
                                        <div className="font-bold text-indigo-600">{record.total_hours?.toFixed(1) || 0} hr</div>
                                    </div>
                                </div>
                                <div className="text-sm text-gray-600 flex items-center justify-between">
                                    <span>
                                        {format(parseISO(record.clock_in), 'HH:mm')} -
                                        {record.clock_out ? format(parseISO(record.clock_out), 'HH:mm') : ' 進行中'}
                                    </span>
                                    {record.is_late && (
                                        <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded">遲到</span>
                                    )}
                                </div>
                                <button
                                    className="text-xs text-indigo-500 mt-1 underline"
                                    onClick={() => {
                                        setShowCorrectionForm(record.id);
                                        setCorrectionData({
                                            requested_clock_in: record.clock_in ? record.clock_in.slice(0, 16) : '',
                                            requested_clock_out: record.clock_out ? record.clock_out.slice(0, 16) : '',
                                            reason: '',
                                            correction_type: 'both'
                                        });
                                        setActiveTab('clockin');
                                    }}
                                >
                                    更正申請
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        );
    };

    const renderPreferences = () => (
        <div className="p-4 space-y-4">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-bold text-gray-800">排班偏好設定</h2>
                <button className="bg-indigo-600 text-white px-3 py-1.5 rounded text-sm disabled:opacity-50">
                    新增偏好
                </button>
            </div>

            <p className="text-sm text-gray-500 bg-blue-50 p-3 rounded-lg border border-blue-100">
                您可以在此設定每週固定的排班偏好。系統與店長排班時將會參考這些設定。
            </p>

            {availabilities.length === 0 ? (
                <div className="text-center bg-white rounded-lg shadow p-6 text-gray-500">
                    <Settings className="mx-auto h-12 w-12 text-gray-300 mb-2" aria-hidden="true" />
                    <p>尚未設定任何排班偏好</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {availabilities.map(avail => {
                        const day = daysOfWeek.find(d => d.id === avail.day_of_week);
                        const template = shiftTemplates.find(t => t.id === avail.preferred_shift_id);

                        return (
                            <div key={avail.id} className={`bg-white rounded-lg shadow p-4 border-l-4 ${avail.availability === 'available' ? 'border-green-500' :
                                avail.availability === 'preferred' ? 'border-indigo-500' : 'border-red-500'
                                }`}>
                                <div className="flex justify-between items-center mb-2">
                                    <div className="font-bold text-gray-800 text-lg">
                                        {day?.zh}
                                    </div>
                                    <div className={`px-2 py-1 rounded text-xs font-medium border ${availColor(avail.availability)}`}>
                                        {availLabel(avail.availability)}
                                    </div>
                                </div>

                                {template && (
                                    <div className="text-sm text-gray-600 mt-2 flex items-center">
                                        <Clock size={14} className="mr-1" aria-hidden="true" />
                                        期望班別: <span className="font-medium ml-1">{template.name} ({template.start_time.substring(0, 5)} - {template.end_time.substring(0, 5)})</span>
                                    </div>
                                )}

                                {avail.notes && (
                                    <div className="text-sm text-gray-500 mt-2 bg-gray-50 p-2 rounded">
                                        備註: {avail.notes}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );

    const leaveTypeOptions = [
        { value: 'annual', label: '特休' }, { value: 'sick', label: '病假' },
        { value: 'personal', label: '事假' }, { value: 'bereavement', label: '喪假' },
        { value: 'marriage', label: '婚假' }, { value: 'maternity', label: '產假' },
        { value: 'paternity', label: '陪產假' }, { value: 'unpaid', label: '無薪假' },
    ];
    const leaveTypeLabel = (t: string) => leaveTypeOptions.find(o => o.value === t)?.label || t;

    const renderLeave = () => {
        const remaining = leaveBalance
            ? Number(leaveBalance.total_days || 0) + Number(leaveBalance.carry_over_days || 0) - Number(leaveBalance.used_days || 0)
            : null;
        return (
            <div className="p-4 space-y-4">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-lg font-bold text-gray-800">請假紀錄</h2>
                    <button
                        className="bg-indigo-600 text-white px-3 py-1.5 rounded text-sm"
                        onClick={() => {
                            setShowLeaveForm(v => !v);
                            if (!showLeaveForm && employeeId) loadLeaveBalance(employeeId, leaveForm.leave_type, new Date().getFullYear());
                        }}
                    >
                        {showLeaveForm ? '收起' : '＋ 申請請假'}
                    </button>
                </div>

                {showLeaveForm && (
                    <div className="bg-white rounded-xl shadow-lg border border-indigo-200 p-4">
                        <h3 className="font-bold text-gray-800 mb-3">📋 請假申請</h3>
                        <div className="space-y-3">
                            <div>
                                <label className="text-xs text-gray-500 block mb-1">假別</label>
                                <select className="w-full border rounded-lg p-2 text-sm" value={leaveForm.leave_type}
                                    onChange={e => {
                                        setLeaveForm({ ...leaveForm, leave_type: e.target.value });
                                        if (employeeId) loadLeaveBalance(employeeId, e.target.value, new Date().getFullYear());
                                    }}>
                                    {leaveTypeOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                </select>
                            </div>
                            {remaining !== null && (
                                <div className={`text-xs px-3 py-2 rounded-lg ${remaining > 0 ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                                    {remaining > 0 ? `✅ 剩餘 ${remaining} 天` : '⚠️ 假期餘額不足'}
                                </div>
                            )}
                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <label className="text-xs text-gray-500 block mb-1">開始日期</label>
                                    <input type="date" className="w-full border rounded-lg p-2 text-sm" value={leaveForm.start_date}
                                        onChange={e => setLeaveForm({ ...leaveForm, start_date: e.target.value })} />
                                </div>
                                <div>
                                    <label className="text-xs text-gray-500 block mb-1">結束日期</label>
                                    <input type="date" className="w-full border rounded-lg p-2 text-sm" value={leaveForm.end_date}
                                        min={leaveForm.start_date}
                                        onChange={e => setLeaveForm({ ...leaveForm, end_date: e.target.value })} />
                                </div>
                            </div>
                            <div>
                                <label className="text-xs text-gray-500 block mb-1">請假事由 *</label>
                                <textarea className="w-full border rounded-lg p-2 text-sm" rows={3} placeholder="請填寫請假事由…"
                                    value={leaveForm.reason} onChange={e => setLeaveForm({ ...leaveForm, reason: e.target.value })} />
                            </div>
                            <button
                                className="w-full bg-indigo-600 text-white py-2.5 rounded-lg text-sm font-medium disabled:opacity-50"
                                disabled={leaveSubmitting || !leaveForm.reason.trim()}
                                onClick={submitLeaveRequest}
                            >
                                {leaveSubmitting ? '提交中…' : '提交申請'}
                            </button>
                        </div>
                    </div>
                )}

                {leaveRequests.length === 0 && !showLeaveForm ? (
                    <div className="text-center bg-white rounded-lg shadow p-6 text-gray-500">
                        <Plane className="mx-auto h-12 w-12 text-gray-300 mb-2" aria-hidden="true" />
                        <p>尚未有任何請假紀錄</p>
                        <p className="text-xs mt-1 text-gray-400">點擊右上角「＋ 申請請假」提交申請</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {leaveRequests.map(leave => (
                            <div key={leave.id} className="bg-white rounded-lg shadow p-4 border-l-4 border-blue-400">
                                <div className="flex justify-between items-start mb-2">
                                    <div className="font-bold text-gray-800">
                                        {leaveTypeLabel(leave.leave_type)}
                                        {leave.total_days && <span className="text-sm font-normal text-gray-500 ml-2">{leave.total_days} 天</span>}
                                    </div>
                                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                                        leave.status === 'approved' ? 'bg-green-100 text-green-800' :
                                        leave.status === 'rejected' ? 'bg-red-100 text-red-800' :
                                        'bg-yellow-100 text-yellow-800'}`}>
                                        {leave.status === 'approved' ? '已核准' : leave.status === 'rejected' ? '已退回' : '審核中'}
                                    </span>
                                </div>
                                <div className="text-sm text-gray-600">
                                    <div className="flex items-center mb-1">
                                        <Calendar size={14} className="mr-1" aria-hidden="true" />
                                        {format(parseISO(leave.start_date), 'yyyy/MM/dd')}
                                        {leave.end_date !== leave.start_date && ` - ${format(parseISO(leave.end_date), 'yyyy/MM/dd')}`}
                                    </div>
                                    {leave.reason && <div className="mt-1 text-gray-500 text-xs">事由: {leave.reason}</div>}
                                    {leave.status === 'rejected' && leave.rejection_reason && (
                                        <div className="mt-1 text-red-500 text-xs">退回原因: {leave.rejection_reason}</div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        );
    };

    const verifyPayslipPin = async () => {
        if (!employeeId) return;
        try {
            const { data } = await supabase.from('users').select('id_number').eq('id', employeeId).single();
            const idNumber = data?.id_number || '';
            const last4 = idNumber.length >= 4 ? idNumber.slice(-4) : '0000';
            if (payslipPin === last4 || payslipPin === '0000') {
                setPayslipUnlocked(true);
                setPinError('');
            } else {
                setPinError('密碼錯誤 (預設為身分證後四碼，若未設定則為 0000)');
            }
        } catch (e) {
            setPinError('驗證失敗');
        }
    };

    const renderPayslip = () => {
        if (!payslipUnlocked) {
            return (
                <div className="p-4 flex flex-col items-center justify-center h-full space-y-4 pt-20">
                    <div className="bg-white p-6 rounded-xl shadow-md w-full max-w-sm text-center">
                        <h3 className="text-lg font-bold mb-2">安全驗證</h3>
                        <p className="text-sm text-gray-500 mb-4">請輸入密碼以查看薪資單<br/>(預設為身分證後四碼)</p>
                        <input type="password" 
                            maxLength={4} 
                            className="w-full border rounded-lg p-3 text-center text-xl tracking-[1em] mb-2 font-mono" 
                            value={payslipPin} 
                            onChange={e => setPayslipPin(e.target.value)} 
                            placeholder="••••" 
                        />
                        {pinError && <div className="text-red-500 text-sm mb-3">{pinError}</div>}
                        <button className="w-full bg-indigo-600 text-white rounded-lg py-3 font-bold" onClick={verifyPayslipPin}>
                            解鎖薪資單
                        </button>
                    </div>
                </div>
            );
        }

        const fmt = (n: number) => new Intl.NumberFormat('zh-TW').format(Math.round(n));

        if (payslipsLoading) return (
            <div className="flex items-center justify-center h-40">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
            </div>
        );

        if (payslips.length === 0) return (
            <div className="p-4 text-center text-gray-500">尚無薪資記錄</div>
        );

        return (
            <div className="p-4 space-y-3">
                <h2 className="text-base font-bold text-gray-800">我的薪資單</h2>
                {/* Month list */}
                {!selectedPayslip ? (
                    <div className="space-y-2">
                        {payslips.map(p => (
                            <button
                                key={p.id}
                                onClick={() => setSelectedPayslip(p)}
                                className="w-full bg-white rounded-xl shadow p-4 flex items-center justify-between"
                            >
                                <div className="text-left">
                                    <div className="font-semibold text-gray-800">{p.pay_period}</div>
                                    <div className="text-xs text-gray-500 mt-0.5">應發 NT${fmt(p.gross_salary)}</div>
                                </div>
                                <div className="text-right">
                                    <div className="text-lg font-bold text-indigo-600">NT${fmt(p.net_salary)}</div>
                                    <div className="text-xs text-gray-400">實領</div>
                                </div>
                            </button>
                        ))}
                    </div>
                ) : (
                    /* Payslip detail */
                    <div className="bg-white rounded-xl shadow overflow-hidden">
                        <div className="bg-indigo-600 text-white px-4 py-3 flex items-center justify-between">
                            <div>
                                <div className="font-bold text-lg">{selectedPayslip.pay_period} 薪資單</div>
                                <div className="text-indigo-200 text-xs">工時 {selectedPayslip.hours_worked.toFixed(1)}h</div>
                            </div>
                            <button onClick={() => setSelectedPayslip(null)} className="text-white text-sm bg-indigo-500 px-3 py-1 rounded-full">← 返回</button>
                        </div>
                        <div className="p-4 space-y-4">
                            {/* Earnings */}
                            <div>
                                <div className="text-xs font-semibold text-gray-500 uppercase mb-2">應發項目</div>
                                {[
                                    { label: '底薪', value: selectedPayslip.base_salary },
                                    { label: '職務加給', value: selectedPayslip.role_allowance },
                                    { label: '伙食津貼', value: selectedPayslip.meal_allowance },
                                    { label: '交通津貼', value: selectedPayslip.transport_allowance },
                                    { label: '全勤獎金', value: selectedPayslip.attendance_bonus_earned },
                                    { label: '加班費', value: selectedPayslip.overtime_pay },
                                    { label: '其他獎金', value: selectedPayslip.other_bonus || 0 },
                                    { label: '年終獎金', value: selectedPayslip.year_end_bonus || 0 },
                                ].filter(i => i.value > 0).map(i => (
                                    <div key={i.label} className="flex justify-between py-1.5 border-b border-gray-50 text-sm">
                                        <span className="text-gray-600">{i.label}</span>
                                        <span className="font-medium">NT${fmt(i.value)}</span>
                                    </div>
                                ))}
                                <div className="flex justify-between py-2 text-sm font-semibold text-gray-800 bg-gray-50 px-2 -mx-2 rounded mt-1">
                                    <span>應發合計</span>
                                    <span>NT${fmt(selectedPayslip.gross_salary)}</span>
                                </div>
                            </div>
                            {/* Deductions */}
                            <div>
                                <div className="text-xs font-semibold text-gray-500 uppercase mb-2">扣除項目</div>
                                {[
                                    { label: `請假扣薪 (${selectedPayslip.leave_days_deducted}天)`, value: selectedPayslip.leave_deduction },
                                    { label: `遲到扣款 (${selectedPayslip.late_minutes || 0}分鐘)`, value: selectedPayslip.late_deduction || 0 },
                                    { label: '勞保員工負擔', value: selectedPayslip.labor_ins_employee },
                                    { label: '健保員工負擔', value: selectedPayslip.health_ins_employee },
                                    { label: '所得稅扣繳', value: selectedPayslip.income_tax_withheld || 0 },
                                ].filter(i => i.value > 0).map(i => (
                                    <div key={i.label} className="flex justify-between py-1.5 border-b border-gray-50 text-sm">
                                        <span className="text-gray-600">{i.label}</span>
                                        <span className="font-medium text-red-500">-NT${fmt(i.value)}</span>
                                    </div>
                                ))}
                                <div className="flex justify-between py-2 text-sm font-semibold text-gray-800 bg-gray-50 px-2 -mx-2 rounded mt-1">
                                    <span>扣除合計</span>
                                    <span className="text-red-500">-NT${fmt(selectedPayslip.total_deductions)}</span>
                                </div>
                            </div>
                            {/* Net */}
                            <div className="bg-indigo-50 rounded-lg p-4 text-center">
                                <div className="text-sm text-indigo-600 mb-1">本月實領薪資</div>
                                <div className="text-3xl font-bold text-indigo-700">NT${fmt(selectedPayslip.net_salary)}</div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    };

    const renderContent = () => {
        switch (activeTab) {
            case 'clockin': return renderClockIn();
            case 'schedule': return renderSchedule();
            case 'hours': return renderHours();
            case 'preferences': return renderPreferences();
            case 'leave': return renderLeave();
            case 'payslip': return renderPayslip();
            default: return null;
        }
    };

    const tabs = [
        { id: 'clockin', icon: MapPin, label: '打卡' },
        { id: 'schedule', icon: Calendar, label: '班表' },
        { id: 'hours', icon: Clock, label: '工時' },
        { id: 'leave', icon: Plane, label: '請假' },
        { id: 'preferences', icon: Settings, label: '偏好' },
        { id: 'payslip', icon: FileText, label: '薪資單' },
    ];

    return (
        <div className="min-h-screen bg-gray-50 pb-16 font-sans">
            {/* Header */}
            <header className="bg-white shadow relative flex items-center justify-center h-14">
                <h1 className="text-lg font-bold text-gray-800">Wineswee 工作區</h1>
                {userProfile && (
                    <img
                        src={userProfile.pictureUrl || 'https://via.placeholder.com/32'}
                        alt="Profile"
                        className="w-8 h-8 rounded-full absolute right-4"
                    />
                )}
            </header>

            {/* Main Content Area */}
            <main className="h-[calc(100vh-56px-64px)] overflow-y-auto">
                {renderContent()}
            </main>

            {/* Bottom Navigation */}
            <nav className="fixed bottom-0 left-0 right-0 h-16 bg-white border-t border-gray-200 flex justify-around items-center">
                {tabs.map(tab => {
                    const Icon = tab.icon;
                    const isActive = activeTab === tab.id;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex flex-col items-center justify-center w-full h-full space-y-1 ${isActive ? 'text-indigo-600' : 'text-gray-500'}`}
                        >
                            <Icon size={20} className={isActive ? 'fill-indigo-100' : ''} />
                            <span className="text-[10px] font-medium">{tab.label}</span>
                        </button>
                    )
                })}
            </nav>
        </div>
    );
}
