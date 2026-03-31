// ─── Shared Payroll Helpers ───────────────────────────────────────────────────

export function fmt(amount: number): string {
  return new Intl.NumberFormat('zh-TW').format(Math.round(amount))
}

export function StatusBadge({ status, zh }: { status: string; zh: boolean }) {
  const isDraft = status === 'draft'
  return (
    <span
      style={{
        display: 'inline-block',
        fontSize: '11px',
        padding: '2px 8px',
        borderRadius: '4px',
        background: isDraft ? 'rgba(245,158,11,0.15)' : 'rgba(34,197,94,0.15)',
        color: isDraft ? '#f59e0b' : '#22c55e',
        border: `1px solid ${isDraft ? 'rgba(245,158,11,0.3)' : 'rgba(34,197,94,0.3)'}`,
        whiteSpace: 'nowrap' as const,
        fontWeight: 600,
      }}
    >
      {isDraft ? (zh ? '草稿' : 'Draft') : (zh ? '已確認' : 'Confirmed')}
    </span>
  )
}
