import { useState, useEffect } from 'react';
import liff from '@line/liff';
import { supabase } from '../lib/supabase';
import { Calendar, Clock, Settings, Plane, MapPin } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { zhTW } from 'date-fns/locale';

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
                .eq('employee_id', empId)
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
                .eq('employee_id', empId)
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
                .eq('employee_id', empId)
                .order('start_date', { ascending: false });

            if (error) throw error;
            setLeaveRequests(data || []);
        } catch (err: any) {
            console.error('Error loading leave requests:', err.message);
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

    const renderSchedule = () => (
        <div className="p-4 space-y-4">
            <h2 className="text-lg font-bold text-gray-800 mb-4">近期班表</h2>
            {loadingData ? (
                <div className="text-center text-gray-500 py-8">載入中...</div>
            ) : shifts.length === 0 ? (
                <div className="text-center bg-white rounded-lg shadow p-6 text-gray-500">
                    <Calendar className="mx-auto h-12 w-12 text-gray-300 mb-2" />
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
                                <MapPin size={14} className="mr-1" />
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
                    <Settings className="mx-auto h-12 w-12 text-gray-300 mb-2" />
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
                                        <Clock size={14} className="mr-1" />
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

    const renderLeave = () => (
        <div className="p-4 space-y-4">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-bold text-gray-800">休假紀錄</h2>
                <button className="bg-indigo-600 text-white px-3 py-1.5 rounded text-sm disabled:opacity-50">
                    申請休假
                </button>
            </div>

            {leaveRequests.length === 0 ? (
                <div className="text-center bg-white rounded-lg shadow p-6 text-gray-500">
                    <Plane className="mx-auto h-12 w-12 text-gray-300 mb-2" />
                    <p>尚未有任何休假紀錄</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {leaveRequests.map(leave => (
                        <div key={leave.id} className="bg-white rounded-lg shadow p-4 border-l-4 border-blue-400">
                            <div className="flex justify-between items-start mb-2">
                                <div className="font-bold text-gray-800">
                                    {leave.leave_type === 'annual' ? '特休' :
                                        leave.leave_type === 'sick' ? '病假' :
                                            leave.leave_type === 'personal' ? '事假' : '其他'}
                                </div>
                                <span className={`px-2 py-1 rounded text-xs font-medium ${leave.status === 'approved' ? 'bg-green-100 text-green-800' :
                                    leave.status === 'rejected' ? 'bg-red-100 text-red-800' :
                                        'bg-yellow-100 text-yellow-800'
                                    }`}>
                                    {leave.status === 'approved' ? '已核准' :
                                        leave.status === 'rejected' ? '已退回' : '審核中'}
                                </span>
                            </div>
                            <div className="text-sm text-gray-600">
                                <div className="flex items-center mb-1">
                                    <Calendar size={14} className="mr-1" />
                                    {format(parseISO(leave.start_date), 'yyyy/MM/dd')}
                                    {leave.end_date !== leave.start_date && ` - ${format(parseISO(leave.end_date), 'yyyy/MM/dd')}`}
                                </div>
                                {leave.reason && (
                                    <div className="mt-2 text-gray-500 text-xs">事由: {leave.reason}</div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );

    const renderContent = () => {
        switch (activeTab) {
            case 'schedule': return renderSchedule();
            case 'hours': return renderHours();
            case 'preferences': return renderPreferences();
            case 'leave': return renderLeave();
            default: return null;
        }
    };

    const tabs = [
        { id: 'schedule', icon: Calendar, label: '班表' },
        { id: 'hours', icon: Clock, label: '工時' },
        { id: 'preferences', icon: Settings, label: '偏好' },
        { id: 'leave', icon: Plane, label: '請假' },
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
