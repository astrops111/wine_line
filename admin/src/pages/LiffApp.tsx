import { useState, useEffect, useCallback } from 'react';
import liff from '@line/liff';
import { supabase } from '../lib/supabase';
import { Calendar, Clock, Settings, Plane, MapPin, FileText, User } from 'lucide-react';
import type { PayslipRecord, StoreGpsConfig } from '../types/liffApp';
import { ClockInPanel } from '../components/Liff/ClockInPanel';
import { SchedulePanel } from '../components/Liff/SchedulePanel';
import { HoursPanel } from '../components/Liff/HoursPanel';
import { LeavePanel } from '../components/Liff/LeavePanel';
import { PayslipPanel } from '../components/Liff/PayslipPanel';
import { ProfilePanel } from '../components/Liff/ProfilePanel';
import { PreferencesPanel } from '../components/Liff/PreferencesPanel';

export function LiffApp() {
    const [liffId] = useState(import.meta.env.VITE_LIFF_ID || '');
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

    // Store / GPS config
    const [storeGpsConfig, setStoreGpsConfig] = useState<StoreGpsConfig | null>(null);
    const [userStoreId, setUserStoreId] = useState<string | null>(null);

    // Payslip state
    const [payslips, setPayslips] = useState<PayslipRecord[]>([]);
    const [payslipsLoading, setPayslipsLoading] = useState(false);

    // Cross-tab correction request (from HoursPanel -> ClockInPanel)
    const [pendingCorrectionRecordId, setPendingCorrectionRecordId] = useState<string | null>(null);

    // ═══ LIFF INIT ═══
    useEffect(() => {
        const initLiff = async () => {
            try {
                await liff.init({ liffId });
                if (liff.isLoggedIn()) {
                    const profile = await liff.getProfile();
                    setUserProfile(profile);
                    await lookupEmployee(profile.userId);
                } else {
                    liff.login();
                }
            } catch (err: any) {
                console.error('LIFF Init Error:', err);
                setError('Failed to initialize LIFF application.');
                setLoading(false);
            }
        };

        if (import.meta.env.DEV) {
            const mockLineId = 'U_MOCK_LINE_ID';
            setUserProfile({ displayName: 'Test User', userId: mockLineId });
            lookupEmployee(mockLineId);
        } else {
            initLiff();
        }
    }, [liffId]);

    // ═══ EMPLOYEE LOOKUP (BUG-03 fix: .eq('user_id') not 'employee_id') ═══
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

    // ═══ DATA LOADERS ═══
    const loadShifts = async (empId: string) => {
        setLoadingData(true);
        try {
            const today = new Date().toISOString().split('T')[0];
            const { data, error } = await supabase
                .from('shift_assignments')
                .select(`
                    id, date, start_time, end_time, status,
                    stores ( name ),
                    shift_templates ( name )
                `)
                .eq('user_id', empId)
                .gte('date', today)
                .in('status', ['published', 'acknowledged'])
                .order('date', { ascending: true })
                .limit(14);

            if (error) throw error;
            setShifts(data || []);
        } catch (err: any) {
            console.error('Error loading shifts:', err.message);
        } finally {
            setLoadingData(false);
        }
    };

    const loadTimeRecords = useCallback(async (empId?: string) => {
        const id = empId || employeeId;
        if (!id) return;
        try {
            const today = new Date();
            const startOfWeekDate = new Date(today);
            startOfWeekDate.setDate(today.getDate() - today.getDay());
            const startStr = startOfWeekDate.toISOString().split('T')[0];

            const { data, error } = await supabase
                .from('time_records')
                .select(`
                    id, clock_in, clock_out, is_late, total_hours,
                    stores ( name )
                `)
                .eq('user_id', id)
                .gte('clock_in', startStr)
                .order('clock_in', { ascending: false });

            if (error) throw error;
            setTimeRecords(data || []);
        } catch (err: any) {
            console.error('Error loading time records:', err.message);
        }
    }, [employeeId]);

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

    const loadLeaveRequests = useCallback(async (empId?: string) => {
        const id = empId || employeeId;
        if (!id) return;
        try {
            const { data, error } = await supabase
                .from('leave_requests')
                .select('*')
                .eq('user_id', id)
                .order('start_date', { ascending: false });
            if (error) throw error;
            setLeaveRequests(data || []);
        } catch (err: any) {
            console.error('Error loading leave requests:', err.message);
        }
    }, [employeeId]);

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

    // ═══ CALLBACKS FOR CHILD COMPONENTS ═══
    const handleTimeRecordsRefresh = useCallback(async () => {
        await loadTimeRecords();
    }, [loadTimeRecords]);

    const handleLeaveRequestsRefresh = useCallback(async () => {
        await loadLeaveRequests();
    }, [loadLeaveRequests]);

    const handleCorrectionRequest = useCallback((recordId: string) => {
        setPendingCorrectionRecordId(recordId);
        setActiveTab('clockin');
    }, []);

    const handleCorrectionHandled = useCallback(() => {
        setPendingCorrectionRecordId(null);
    }, []);

    // ═══ LOADING / ERROR STATES ═══
    if (loading) {
        return <div className="min-h-screen flex items-center justify-center bg-gray-50 text-gray-500">Loading...</div>;
    }

    if (error || !employeeId) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center bg-gray-50">
                <div className="text-red-500 mb-4 text-4xl">{'\u26A0\uFE0F'}</div>
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

    // ═══ TAB CONTENT ═══
    const renderContent = () => {
        switch (activeTab) {
            case 'clockin':
                return (
                    <ClockInPanel
                        employeeId={employeeId}
                        userStoreId={userStoreId}
                        storeGpsConfig={storeGpsConfig}
                        timeRecords={timeRecords}
                        onTimeRecordsRefresh={handleTimeRecordsRefresh}
                        pendingCorrectionRecordId={pendingCorrectionRecordId}
                        onCorrectionHandled={handleCorrectionHandled}
                    />
                );
            case 'schedule':
                return <SchedulePanel shifts={shifts} loadingData={loadingData} />;
            case 'hours':
                return (
                    <HoursPanel
                        timeRecords={timeRecords}
                        onCorrectionRequest={handleCorrectionRequest}
                    />
                );
            case 'preferences':
                return <PreferencesPanel availabilities={availabilities} shiftTemplates={shiftTemplates} />;
            case 'leave':
                return (
                    <LeavePanel
                        employeeId={employeeId}
                        userStoreId={userStoreId}
                        leaveRequests={leaveRequests}
                        onLeaveRequestsRefresh={handleLeaveRequestsRefresh}
                    />
                );
            case 'payslip':
                return (
                    <PayslipPanel
                        employeeId={employeeId}
                        payslips={payslips}
                        payslipsLoading={payslipsLoading}
                    />
                );
            case 'profile':
                return <ProfilePanel employeeId={employeeId} />;
            default:
                return null;
        }
    };

    const tabs = [
        { id: 'clockin', icon: MapPin, label: '\u6253\u5361' },
        { id: 'schedule', icon: Calendar, label: '\u73ED\u8868' },
        { id: 'hours', icon: Clock, label: '\u5DE5\u6642' },
        { id: 'leave', icon: Plane, label: '\u8ACB\u5047' },
        { id: 'preferences', icon: Settings, label: '\u504F\u597D' },
        { id: 'payslip', icon: FileText, label: '\u85AA\u8CC7\u55AE' },
        { id: 'profile', icon: User, label: '\u500B\u4EBA' },
    ];

    return (
        <div className="min-h-screen bg-gray-50 pb-16 font-sans">
            {/* Header */}
            <header className="bg-white shadow relative flex items-center justify-center h-14">
                <h1 className="text-lg font-bold text-gray-800">Wineswee {'\u5DE5\u4F5C\u5340'}</h1>
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
                    );
                })}
            </nav>
        </div>
    );
}
