// ─── Leave Module Type Definitions ────────────────────────────────────────────

export interface Store {
    id: string
    name: string
}

export interface User {
    id: string
    name: string
    email: string | null
    status: string
    store_id: string | null
    hire_date: string | null
    employee_type: string
    store?: { name: string } | null
}

export interface LeaveRequest {
    id: string
    user_id: string
    store_id: string | null
    organization_id: string
    start_date: string
    end_date: string
    leave_type: string
    reason: string | null
    status: 'pending' | 'approved' | 'rejected' | 'cancelled'
    total_days: number
    is_paid: boolean
    approved_at: string | null
    created_at?: string
    rejection_reason?: string | null
    user?: {
        name: string
        store_id: string | null
        store?: { name: string } | null
    } | null
}

export interface LeaveBalance {
    id?: string
    organization_id: string
    user_id: string
    year: number
    leave_type: string
    total_days: number
    used_days: number
    carry_over_days: number
    expires_at: string | null
}

export interface BalanceRow {
    user: User
    balances: Record<string, LeaveBalance>
    expanded: boolean
    editType: string
    editTotal: string
    editCarry: string
}

export type TabType = 'pending' | 'all' | 'balances' | 'calendar'

// ─── Constants ────────────────────────────────────────────────────────────────

export const LEAVE_TYPE_COLORS: Record<string, string> = {
    annual: '#22c55e',
    sick: '#f59e0b',
    personal: '#3b82f6',
    bereavement: '#8b5cf6',
    marriage: '#ec4899',
    maternity: '#f43f5e',
    paternity: '#0ea5e9',
    unpaid: '#6b7280',
}

export const LEAVE_STATUS_COLORS: Record<string, string> = {
    pending: '#f59e0b',
    approved: '#22c55e',
    rejected: '#f43f5e',
    cancelled: '#6b7280',
}

export const PAID_TYPES = ['annual', 'sick', 'personal', 'bereavement', 'marriage', 'maternity', 'paternity']

export function getLeaveTypeLabels(zh: boolean): Record<string, string> {
    return {
        annual: zh ? '特休' : 'Annual',
        sick: zh ? '病假' : 'Sick',
        personal: zh ? '事假' : 'Personal',
        bereavement: zh ? '喪假' : 'Bereavement',
        marriage: zh ? '婚假' : 'Marriage',
        maternity: zh ? '產假' : 'Maternity',
        paternity: zh ? '陪產假' : 'Paternity',
        unpaid: zh ? '無薪假' : 'Unpaid',
    }
}

export function getLeaveStatusLabels(zh: boolean): Record<string, string> {
    return {
        pending: zh ? '待審核' : 'Pending',
        approved: zh ? '已批准' : 'Approved',
        rejected: zh ? '已拒絕' : 'Rejected',
        cancelled: zh ? '已取消' : 'Cancelled',
    }
}
