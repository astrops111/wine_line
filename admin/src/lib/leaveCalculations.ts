// ─── Leave Calculation Utilities ──────────────────────────────────────────────

import type { LeaveBalance } from '../types/leave'

/**
 * Calculate annual leave entitlement based on Taiwan Labor Standards Act.
 * Returns number of days entitled based on hire date seniority.
 */
export function calcAnnualLeave(hireDateStr: string): number {
    const hire = new Date(hireDateStr)
    const now = new Date()
    const months =
        (now.getFullYear() - hire.getFullYear()) * 12 +
        (now.getMonth() - hire.getMonth())
    const years = months / 12
    if (months < 6) return 0
    if (months < 12) return 3
    if (years < 2) return 7
    if (years < 3) return 10
    if (years < 5) return 14
    if (years < 10) return 15
    return Math.min(30, 15 + Math.floor(years - 10))
}

/**
 * Calculate number of calendar days between two dates (inclusive).
 */
export function calcDays(start: string, end: string): number {
    if (!start || !end) return 0
    const s = new Date(start)
    const e = new Date(end)
    const diff = Math.ceil((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1
    return diff > 0 ? diff : 0
}

/**
 * Format an ISO date string to YYYY-MM-DD.
 */
export function formatDate(dateStr: string): string {
    if (!dateStr) return ''
    return dateStr.slice(0, 10)
}

/**
 * Get the first and last day of the current month as YYYY-MM-DD strings.
 */
export function thisMonthRange(): { start: string; end: string } {
    const now = new Date()
    const start = new Date(now.getFullYear(), now.getMonth(), 1)
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    return {
        start: start.toISOString().slice(0, 10),
        end: end.toISOString().slice(0, 10),
    }
}

/**
 * Calculate remaining leave days from a balance record.
 */
export function getRemainingDays(bal: LeaveBalance | undefined): number {
    if (!bal) return 0
    return (bal.total_days || 0) + (bal.carry_over_days || 0) - (bal.used_days || 0)
}
