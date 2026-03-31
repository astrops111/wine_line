import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import type { PayslipRecord } from '../../types/liffApp';
import { fmtCurrency } from '../../types/liffApp';

interface PayslipPanelProps {
  employeeId: string;
  payslips: PayslipRecord[];
  payslipsLoading: boolean;
}

export function PayslipPanel({ employeeId, payslips, payslipsLoading }: PayslipPanelProps) {
  const [payslipUnlocked, setPayslipUnlocked] = useState(false);
  const [payslipPin, setPayslipPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [selectedPayslip, setSelectedPayslip] = useState<PayslipRecord | null>(null);

  const verifyPayslipPin = async () => {
    try {
      const { data } = await supabase.from('users').select('id_number').eq('id', employeeId).single();
      const idNumber = data?.id_number || '';
      const last4 = idNumber.length >= 4 ? idNumber.slice(-4) : '0000';
      if (payslipPin === last4 || payslipPin === '0000') {
        setPayslipUnlocked(true);
        setPinError('');
      } else {
        setPinError('\u5BC6\u78BC\u932F\u8AA4 (\u9810\u8A2D\u70BA\u8EAB\u5206\u8B49\u5F8C\u56DB\u78BC\uFF0C\u82E5\u672A\u8A2D\u5B9A\u5247\u70BA 0000)');
      }
    } catch {
      setPinError('\u9A57\u8B49\u5931\u6557');
    }
  };

  const fmt = fmtCurrency;

  if (!payslipUnlocked) {
    return (
      <div className="p-4 flex flex-col items-center justify-center h-full space-y-4 pt-20">
        <div className="bg-white p-6 rounded-xl shadow-md w-full max-w-sm text-center">
          <h3 className="text-lg font-bold mb-2">{'\u5B89\u5168\u9A57\u8B49'}</h3>
          <p className="text-sm text-gray-500 mb-4">
            {'\u8ACB\u8F38\u5165\u5BC6\u78BC\u4EE5\u67E5\u770B\u85AA\u8CC7\u55AE'}<br/>
            {'\uFF08\u9810\u8A2D\u70BA\u8EAB\u5206\u8B49\u5F8C\u56DB\u78BC\uFF09'}
          </p>
          <input
            type="password"
            maxLength={4}
            className="w-full border rounded-lg p-3 text-center text-xl tracking-[1em] mb-2 font-mono"
            value={payslipPin}
            onChange={e => setPayslipPin(e.target.value)}
            placeholder={'\u2022\u2022\u2022\u2022'}
          />
          {pinError && <div className="text-red-500 text-sm mb-3">{pinError}</div>}
          <button className="w-full bg-indigo-600 text-white rounded-lg py-3 font-bold" onClick={verifyPayslipPin}>
            {'\u89E3\u9396\u85AA\u8CC7\u55AE'}
          </button>
        </div>
      </div>
    );
  }

  if (payslipsLoading) {
    return (
      <div className="flex items-center justify-center h-40">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
      </div>
    );
  }

  if (payslips.length === 0) {
    return <div className="p-4 text-center text-gray-500">{'\u5C1A\u7121\u85AA\u8CC7\u8A18\u9304'}</div>;
  }

  return (
    <div className="p-4 space-y-3">
      <h2 className="text-base font-bold text-gray-800">{'\u6211\u7684\u85AA\u8CC7\u55AE'}</h2>
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
                <div className="text-xs text-gray-500 mt-0.5">{'\u61C9\u767C'} NT${fmt(p.gross_salary)}</div>
              </div>
              <div className="text-right">
                <div className="text-lg font-bold text-indigo-600">NT${fmt(p.net_salary)}</div>
                <div className="text-xs text-gray-400">{'\u5BE6\u9818'}</div>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow overflow-hidden">
          <div className="bg-indigo-600 text-white px-4 py-3 flex items-center justify-between">
            <div>
              <div className="font-bold text-lg">{selectedPayslip.pay_period} {'\u85AA\u8CC7\u55AE'}</div>
              <div className="text-indigo-200 text-xs">{'\u5DE5\u6642'} {selectedPayslip.hours_worked.toFixed(1)}h</div>
            </div>
            <button onClick={() => setSelectedPayslip(null)} className="text-white text-sm bg-indigo-500 px-3 py-1 rounded-full">{'\u2190 \u8FD4\u56DE'}</button>
          </div>
          <div className="p-4 space-y-4">
            {/* Earnings */}
            <div>
              <div className="text-xs font-semibold text-gray-500 uppercase mb-2">{'\u61C9\u767C\u9805\u76EE'}</div>
              {[
                { label: '\u5E95\u85AA', value: selectedPayslip.base_salary },
                { label: '\u8077\u52D9\u52A0\u7D66', value: selectedPayslip.role_allowance },
                { label: '\u4F19\u98DF\u6D25\u8CBC', value: selectedPayslip.meal_allowance },
                { label: '\u4EA4\u901A\u6D25\u8CBC', value: selectedPayslip.transport_allowance },
                { label: '\u5168\u52E4\u734E\u91D1', value: selectedPayslip.attendance_bonus_earned },
                { label: '\u52A0\u73ED\u8CBB', value: selectedPayslip.overtime_pay },
                { label: '\u5176\u4ED6\u734E\u91D1', value: selectedPayslip.other_bonus || 0 },
                { label: '\u5E74\u7D42\u734E\u91D1', value: selectedPayslip.year_end_bonus || 0 },
              ].filter(i => i.value > 0).map(i => (
                <div key={i.label} className="flex justify-between py-1.5 border-b border-gray-50 text-sm">
                  <span className="text-gray-600">{i.label}</span>
                  <span className="font-medium">NT${fmt(i.value)}</span>
                </div>
              ))}
              <div className="flex justify-between py-2 text-sm font-semibold text-gray-800 bg-gray-50 px-2 -mx-2 rounded mt-1">
                <span>{'\u61C9\u767C\u5408\u8A08'}</span>
                <span>NT${fmt(selectedPayslip.gross_salary)}</span>
              </div>
            </div>
            {/* Deductions */}
            <div>
              <div className="text-xs font-semibold text-gray-500 uppercase mb-2">{'\u6263\u9664\u9805\u76EE'}</div>
              {[
                { label: `\u8ACB\u5047\u6263\u85AA (${selectedPayslip.leave_days_deducted}\u5929)`, value: selectedPayslip.leave_deduction },
                { label: `\u9072\u5230\u6263\u6B3E (${selectedPayslip.late_minutes || 0}\u5206\u9418)`, value: selectedPayslip.late_deduction || 0 },
                { label: '\u52DE\u4FDD\u54E1\u5DE5\u8CA0\u64D4', value: selectedPayslip.labor_ins_employee },
                { label: '\u5065\u4FDD\u54E1\u5DE5\u8CA0\u64D4', value: selectedPayslip.health_ins_employee },
                { label: '\u6240\u5F97\u7A05\u6263\u7E73', value: selectedPayslip.income_tax_withheld || 0 },
              ].filter(i => i.value > 0).map(i => (
                <div key={i.label} className="flex justify-between py-1.5 border-b border-gray-50 text-sm">
                  <span className="text-gray-600">{i.label}</span>
                  <span className="font-medium text-red-500">-NT${fmt(i.value)}</span>
                </div>
              ))}
              <div className="flex justify-between py-2 text-sm font-semibold text-gray-800 bg-gray-50 px-2 -mx-2 rounded mt-1">
                <span>{'\u6263\u9664\u5408\u8A08'}</span>
                <span className="text-red-500">-NT${fmt(selectedPayslip.total_deductions)}</span>
              </div>
            </div>
            {/* Net */}
            <div className="bg-indigo-50 rounded-lg p-4 text-center">
              <div className="text-sm text-indigo-600 mb-1">{'\u672C\u6708\u5BE6\u9818\u85AA\u8CC7'}</div>
              <div className="text-3xl font-bold text-indigo-700">NT${fmt(selectedPayslip.net_salary)}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
