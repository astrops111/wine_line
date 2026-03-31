// ─── Overtime Helper Functions ────────────────────────────────────────────────

import type { NewRequestForm } from '../types/overtime'

/** Calculate hours between two datetime strings, rounded to nearest 0.5h */
export function calcHoursFromDatetime(start: string, end: string): number {
  if (!start || !end) return 0
  return Math.round(((new Date(end).getTime() - new Date(start).getTime()) / 3600000) * 2) / 2
}

/** Get the first and last day of the current month as YYYY-MM-DD strings */
export function getCurrentMonthRange(): { start: string; end: string } {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), 1)
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  return {
    start: start.toISOString().split('T')[0],
    end: end.toISOString().split('T')[0],
  }
}

/** Get a human-readable label for the current month */
export function getCurrentMonthName(zh: boolean): string {
  const now = new Date()
  if (zh) {
    return `${now.getFullYear()} 年 ${now.getMonth() + 1} 月`
  }
  return now.toLocaleString('en-US', { month: 'long', year: 'numeric' })
}

/** Risk colour based on monthly approved hours */
export function riskColor(hours: number): string {
  if (hours > 46) return '#f43f5e'
  if (hours > 38) return '#f59e0b'
  return '#22c55e'
}

/** Risk label based on monthly approved hours */
export function riskLabel(hours: number, zh: boolean): string {
  if (hours > 46) return zh ? '超標' : 'Over Cap'
  if (hours > 38) return zh ? '接近上限' : 'Near Cap'
  return zh ? '正常' : 'Normal'
}

/** Create a blank NewRequestForm */
export function createEmptyForm(): NewRequestForm {
  return {
    user_id: '',
    request_date: new Date().toISOString().split('T')[0],
    filing_type: 'pre',
    planned_end_time: '',
    actual_start_time: '',
    actual_end_time: '',
    ot_hours: '',
    ot_type: 'pay',
    reason: '',
  }
}
