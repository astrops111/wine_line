export interface Store {
  id: string;
  name: string;
  store_code: string;
  operating_hours: any;
  store_type: string;
  working_hour_type?: string;
  variable_period_start?: string;
  default_labor_budget?: number;
  hourly_rate_default?: number;
}

export interface ShiftTemplate {
  id: string;
  store_id: string;
  name: string;
  start_time: string;
  end_time: string;
  break_minutes: number;
  color: string;
  required_skills?: string[];
}

export interface Employee {
  id: string;
  name: string;
  position: string | null;
  employee_type: string;
  max_hours_per_week: number;
  store_id: string | null;
}

export interface ShiftAssignment {
  id: string;
  schedule_id: string;
  user_id: string;
  date: string;
  start_time: string;
  end_time: string;
  break_minutes: number;
  position: string | null;
  is_overtime: boolean;
  overtime_hours: number;
  status: string;
  shift_template_id: string | null;
}

export interface Schedule {
  id: string;
  store_id: string;
  week_start: string;
  status: string;
  generated_by: string;
  total_labor_hours: number;
  estimated_cost: number;
  violations: any[];
  labor_budget?: number;
  budget_alert_threshold?: number;
}

export interface Availability {
  id: string;
  user_id: string;
  day_of_week: number;
  availability: string;
  notes: string | null;
}

export interface LaborViolation {
  employee_id: string;
  employee_name: string;
  type: string;
  message: string;
  severity: 'warning' | 'error';
  date?: string;
  assignment_id?: string;
}

export interface ShiftSwapRequest {
  id: string;
  organization_id: string;
  requester_id: string;
  target_id: string | null;
  requester_shift_id: string;
  target_shift_id: string | null;
  swap_type: 'swap' | 'give_away' | 'open_shift';
  reason: string | null;
  status: 'pending' | 'target_accepted' | 'approved' | 'rejected' | 'cancelled';
  manager_id: string | null;
  manager_note: string | null;
  approved_at: string | null;
  bid_user_id: string | null;
  bid_message: string | null;
  bid_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ScheduleTemplate {
  id: string;
  name: string;
  description: string | null;
  assignments: any[];
}

export interface DemandForecast {
  date: string;
  recommended_staff: number;
  confidence: number;
  reason: string;
}

export interface SwapForm {
  requester_id: string;
  requester_shift_id: string;
  target_id: string;
  swap_type: 'swap' | 'give_away' | 'open_shift';
  reason: string;
}

export interface OpenShiftForm {
  date: string;
  start_time: string;
  end_time: string;
  break_minutes: string;
  reason: string;
}
