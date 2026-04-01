export interface PayslipRecord {
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

export interface StoreGpsConfig {
  id: string;
  name: string;
  gps_lat: number | null;
  gps_lng: number | null;
  gps_radius_m: number;
  clock_in_method: string;
  wifi_allowed_ips: string[];
}

export interface CorrectionData {
  requested_clock_in: string;
  requested_clock_out: string;
  reason: string;
  correction_type: string;
}

export interface LeaveForm {
  leave_type: string;
  start_date: string;
  end_date: string;
  reason: string;
}

export interface ProfileForm {
  phone: string;
  address: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  bank_code: string;
  bank_account: string;
}

export type ClockInStatus = 'idle' | 'locating' | 'success' | 'error' | 'out_of_range';

export const LEAVE_TYPE_OPTIONS = [
  { value: 'annual', label: '\u7279\u4F11' },
  { value: 'sick', label: '\u75C5\u5047' },
  { value: 'personal', label: '\u4E8B\u5047' },
  { value: 'bereavement', label: '\u55AA\u5047' },
  { value: 'marriage', label: '\u5A5A\u5047' },
  { value: 'maternity', label: '\u7522\u5047' },
  { value: 'paternity', label: '\u966A\u7522\u5047' },
  { value: 'unpaid', label: '\u7121\u85AA\u5047' },
] as const;

export const leaveTypeLabel = (t: string): string =>
  LEAVE_TYPE_OPTIONS.find(o => o.value === t)?.label || t;

export const DAYS_OF_WEEK = [
  { id: 0, zh: '\u9031\u65E5', en: 'Sunday' },
  { id: 1, zh: '\u9031\u4E00', en: 'Monday' },
  { id: 2, zh: '\u9031\u4E8C', en: 'Tuesday' },
  { id: 3, zh: '\u9031\u4E09', en: 'Wednesday' },
  { id: 4, zh: '\u9031\u56DB', en: 'Thursday' },
  { id: 5, zh: '\u9031\u4E94', en: 'Friday' },
  { id: 6, zh: '\u9031\u516D', en: 'Saturday' },
] as const;

export const availLabel = (val: string): string => {
  switch (val) {
    case 'available': return '\u53EF\u6392\u73ED';
    case 'preferred': return '\u504F\u597D\u6392\u73ED';
    case 'unavailable': return '\u4E0D\u53EF\u6392\u73ED';
    default: return val;
  }
};

export const availColor = (val: string): string => {
  switch (val) {
    case 'available': return 'bg-green-100 text-green-800 border-green-200';
    case 'preferred': return 'bg-indigo-100 text-indigo-800 border-indigo-200';
    case 'unavailable': return 'bg-red-100 text-red-800 border-red-200';
    default: return 'bg-gray-100 text-gray-800 border-gray-200';
  }
};

export const fmtCurrency = (n: number): string =>
  new Intl.NumberFormat('zh-TW').format(Math.round(n));
