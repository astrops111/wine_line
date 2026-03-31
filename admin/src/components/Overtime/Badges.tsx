// ─── Overtime Badge Sub-components ────────────────────────────────────────────

export function FilingTypeBadge({ type, zh }: { type: 'pre' | 'post'; zh: boolean }) {
  const isPre = type === 'pre'
  return (
    <span
      className="badge"
      style={{
        background: isPre ? 'rgba(59,130,246,0.15)' : 'rgba(245,158,11,0.15)',
        color: isPre ? '#3b82f6' : '#f59e0b',
        border: `1px solid ${isPre ? 'rgba(59,130,246,0.3)' : 'rgba(245,158,11,0.3)'}`,
        fontSize: '11px',
        padding: '2px 8px',
        borderRadius: '4px',
        whiteSpace: 'nowrap',
      }}
    >
      {isPre ? (zh ? '申請前' : 'Pre') : (zh ? '事後補報' : 'Post')}
    </span>
  )
}

export function OtTypeBadge({ type, zh }: { type: 'pay' | 'comp'; zh: boolean }) {
  const isPay = type === 'pay'
  return (
    <span
      className="badge"
      style={{
        background: isPay ? 'rgba(34,197,94,0.15)' : 'rgba(139,92,246,0.15)',
        color: isPay ? '#22c55e' : '#8b5cf6',
        border: `1px solid ${isPay ? 'rgba(34,197,94,0.3)' : 'rgba(139,92,246,0.3)'}`,
        fontSize: '11px',
        padding: '2px 8px',
        borderRadius: '4px',
        whiteSpace: 'nowrap',
      }}
    >
      {isPay ? (zh ? '加班費' : 'Pay') : (zh ? '補休' : 'Comp')}
    </span>
  )
}

export function StatusBadge({ status, zh }: { status: string; zh: boolean }) {
  const config: Record<string, { bg: string; color: string; border: string; label: string; labelEn: string }> = {
    pending:   { bg: 'rgba(245,158,11,0.15)',  color: '#f59e0b', border: 'rgba(245,158,11,0.3)',  label: '待審核', labelEn: 'Pending' },
    approved:  { bg: 'rgba(34,197,94,0.15)',   color: '#22c55e', border: 'rgba(34,197,94,0.3)',   label: '已核准', labelEn: 'Approved' },
    rejected:  { bg: 'rgba(244,63,94,0.15)',   color: '#f43f5e', border: 'rgba(244,63,94,0.3)',   label: '已拒絕', labelEn: 'Rejected' },
    cancelled: { bg: 'rgba(120,120,140,0.15)', color: '#6b7280', border: 'rgba(120,120,140,0.3)', label: '已取消', labelEn: 'Cancelled' },
  }
  const c = config[status] ?? config['pending']
  return (
    <span
      className="badge"
      style={{
        background: c.bg,
        color: c.color,
        border: `1px solid ${c.border}`,
        fontSize: '11px',
        padding: '2px 8px',
        borderRadius: '4px',
        whiteSpace: 'nowrap',
      }}
    >
      {zh ? c.label : c.labelEn}
    </span>
  )
}
