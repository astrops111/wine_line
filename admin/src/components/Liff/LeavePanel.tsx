import { useState } from 'react';
import { Calendar, Plane } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { supabase } from '../../lib/supabase';
import type { LeaveForm } from '../../types/liffApp';
import { LEAVE_TYPE_OPTIONS, leaveTypeLabel } from '../../types/liffApp';

interface LeavePanelProps {
  employeeId: string;
  userStoreId: string | null;
  leaveRequests: any[];
  onLeaveRequestsRefresh: () => Promise<void>;
}

export function LeavePanel({
  employeeId,
  userStoreId,
  leaveRequests,
  onLeaveRequestsRefresh,
}: LeavePanelProps) {
  const [showLeaveForm, setShowLeaveForm] = useState(false);
  const [leaveForm, setLeaveForm] = useState<LeaveForm>({
    leave_type: 'annual',
    start_date: new Date().toISOString().split('T')[0],
    end_date: new Date().toISOString().split('T')[0],
    reason: '',
  });
  const [leaveBalance, setLeaveBalance] = useState<any>(null);
  const [leaveSubmitting, setLeaveSubmitting] = useState(false);

  const loadLeaveBalance = async (leaveType: string, year: number) => {
    const { data } = await supabase
      .from('leave_balances')
      .select('total_days, used_days, carry_over_days')
      .eq('user_id', employeeId)
      .eq('year', year)
      .eq('leave_type', leaveType)
      .maybeSingle();
    setLeaveBalance(data);
  };

  const submitLeaveRequest = async () => {
    if (!leaveForm.start_date || !leaveForm.end_date || !leaveForm.reason) return;
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
                reason: leaveForm.reason,
              },
            }),
          });
        } catch (err) {
          console.error('Failed to notify manager:', err);
        }
      }

      setShowLeaveForm(false);
      setLeaveBalance(null);
      setLeaveForm({
        leave_type: 'annual',
        start_date: new Date().toISOString().split('T')[0],
        end_date: new Date().toISOString().split('T')[0],
        reason: '',
      });
      await onLeaveRequestsRefresh();
      alert('\u8ACB\u5047\u7533\u8ACB\u5DF2\u63D0\u4EA4\uFF01\u7B49\u5F85\u4E3B\u7BA1\u5BE9\u6838\u3002');
    } catch (err: any) {
      alert(`\u63D0\u4EA4\u5931\u6557\uFF1A${err.message}`);
    } finally {
      setLeaveSubmitting(false);
    }
  };

  const remaining = leaveBalance
    ? Number(leaveBalance.total_days || 0) + Number(leaveBalance.carry_over_days || 0) - Number(leaveBalance.used_days || 0)
    : null;

  return (
    <div className="p-4 space-y-4">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-bold text-gray-800">{'\u8ACB\u5047\u7D00\u9304'}</h2>
        <button
          className="bg-indigo-600 text-white px-3 py-1.5 rounded text-sm"
          onClick={() => {
            setShowLeaveForm(v => !v);
            if (!showLeaveForm) loadLeaveBalance(leaveForm.leave_type, new Date().getFullYear());
          }}
        >
          {showLeaveForm ? '\u6536\u8D77' : '\uFF0B \u7533\u8ACB\u8ACB\u5047'}
        </button>
      </div>

      {showLeaveForm && (
        <div className="bg-white rounded-xl shadow-lg border border-indigo-200 p-4">
          <h3 className="font-bold text-gray-800 mb-3">{'\uD83D\uDCCB \u8ACB\u5047\u7533\u8ACB'}</h3>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-gray-500 block mb-1">{'\u5047\u5225'}</label>
              <select
                className="w-full border rounded-lg p-2 text-sm"
                value={leaveForm.leave_type}
                onChange={e => {
                  setLeaveForm({ ...leaveForm, leave_type: e.target.value });
                  loadLeaveBalance(e.target.value, new Date().getFullYear());
                }}
              >
                {LEAVE_TYPE_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            {remaining !== null && (
              <div className={`text-xs px-3 py-2 rounded-lg ${remaining > 0 ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                {remaining > 0 ? `\u2705 \u5269\u9918 ${remaining} \u5929` : '\u26A0\uFE0F \u5047\u671F\u9918\u984D\u4E0D\u8DB3'}
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-gray-500 block mb-1">{'\u958B\u59CB\u65E5\u671F'}</label>
                <input
                  type="date"
                  className="w-full border rounded-lg p-2 text-sm"
                  value={leaveForm.start_date}
                  onChange={e => setLeaveForm({ ...leaveForm, start_date: e.target.value })}
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">{'\u7D50\u675F\u65E5\u671F'}</label>
                <input
                  type="date"
                  className="w-full border rounded-lg p-2 text-sm"
                  value={leaveForm.end_date}
                  min={leaveForm.start_date}
                  onChange={e => setLeaveForm({ ...leaveForm, end_date: e.target.value })}
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">{'\u8ACB\u5047\u4E8B\u7531 *'}</label>
              <textarea
                className="w-full border rounded-lg p-2 text-sm"
                rows={3}
                placeholder={'\u8ACB\u586B\u5BEB\u8ACB\u5047\u4E8B\u7531\u2026'}
                value={leaveForm.reason}
                onChange={e => setLeaveForm({ ...leaveForm, reason: e.target.value })}
              />
            </div>
            <button
              className="w-full bg-indigo-600 text-white py-2.5 rounded-lg text-sm font-medium disabled:opacity-50"
              disabled={leaveSubmitting || !leaveForm.reason.trim()}
              onClick={submitLeaveRequest}
            >
              {leaveSubmitting ? '\u63D0\u4EA4\u4E2D\u2026' : '\u63D0\u4EA4\u7533\u8ACB'}
            </button>
          </div>
        </div>
      )}

      {leaveRequests.length === 0 && !showLeaveForm ? (
        <div className="text-center bg-white rounded-lg shadow p-6 text-gray-500">
          <Plane className="mx-auto h-12 w-12 text-gray-300 mb-2" aria-hidden="true" />
          <p>{'\u5C1A\u672A\u6709\u4EFB\u4F55\u8ACB\u5047\u7D00\u9304'}</p>
          <p className="text-xs mt-1 text-gray-400">{'\u9EDE\u64CA\u53F3\u4E0A\u89D2\u300C\uFF0B \u7533\u8ACB\u8ACB\u5047\u300D\u63D0\u4EA4\u7533\u8ACB'}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {leaveRequests.map((leave: any) => (
            <div key={leave.id} className="bg-white rounded-lg shadow p-4 border-l-4 border-blue-400">
              <div className="flex justify-between items-start mb-2">
                <div className="font-bold text-gray-800">
                  {leaveTypeLabel(leave.leave_type)}
                  {leave.total_days && <span className="text-sm font-normal text-gray-500 ml-2">{leave.total_days} {'\u5929'}</span>}
                </div>
                <span className={`px-2 py-1 rounded text-xs font-medium ${
                  leave.status === 'approved' ? 'bg-green-100 text-green-800' :
                  leave.status === 'rejected' ? 'bg-red-100 text-red-800' :
                  'bg-yellow-100 text-yellow-800'
                }`}>
                  {leave.status === 'approved' ? '\u5DF2\u6838\u51C6' : leave.status === 'rejected' ? '\u5DF2\u9000\u56DE' : '\u5BE9\u6838\u4E2D'}
                </span>
              </div>
              <div className="text-sm text-gray-600">
                <div className="flex items-center mb-1">
                  <Calendar size={14} className="mr-1" aria-hidden="true" />
                  {format(parseISO(leave.start_date), 'yyyy/MM/dd')}
                  {leave.end_date !== leave.start_date && ` - ${format(parseISO(leave.end_date), 'yyyy/MM/dd')}`}
                </div>
                {leave.reason && <div className="mt-1 text-gray-500 text-xs">{'\u4E8B\u7531: '}{leave.reason}</div>}
                {leave.status === 'rejected' && leave.rejection_reason && (
                  <div className="mt-1 text-red-500 text-xs">{'\u9000\u56DE\u539F\u56E0: '}{leave.rejection_reason}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
