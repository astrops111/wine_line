// ─── Overtime Type Definitions ────────────────────────────────────────────────

export interface Store {
  id: string
  name: string
}

export interface UserRecord {
  id: string
  name: string
  status: string
  store_id: string | null
  organization_id: string
  max_hours_per_week: number
  store?: Store | null
}

export interface OvertimeRequest {
  id: string
  organization_id: string
  store_id: string | null
  user_id: string
  shift_assignment_id: string | null
  request_date: string
  planned_end_time: string | null
  actual_start_time: string | null
  actual_end_time: string | null
  ot_hours: number | null
  ot_type: 'pay' | 'comp'
  filing_type: 'pre' | 'post'
  reason: string | null
  status: 'pending' | 'approved' | 'rejected' | 'cancelled'
  approved_by: string | null
  approved_at: string | null
  rejection_reason: string | null
  created_at: string
  updated_at: string
  user?: {
    name: string
    store?: Store | null
  } | null
}

export interface NewRequestForm {
  user_id: string
  request_date: string
  filing_type: 'pre' | 'post'
  planned_end_time: string
  actual_start_time: string
  actual_end_time: string
  ot_hours: string
  ot_type: 'pay' | 'comp'
  reason: string
}

export interface MonthlyStats {
  approvedHours: number
  totalHours: number
}

export interface RiskEntry {
  user: UserRecord
  approvedHours: number
  threeMonthHours: number
}
