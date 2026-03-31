// ─── Risk Overview Tab ────────────────────────────────────────────────────────

import type { RiskEntry } from '../../types/overtime'
import { getCurrentMonthName, riskColor, riskLabel } from '../../lib/overtimeHelpers'

interface RiskTabProps {
  zh: boolean
  riskData: RiskEntry[]
  riskLoading: boolean
}

export function RiskTab({ zh, riskData, riskLoading }: RiskTabProps) {
  return (
    <div>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '20px',
      }}>
        <div>
          <h2 style={{ fontSize: '16px', fontWeight: 600, margin: 0 }}>
            {zh ? '加班風險概覽' : 'OT Risk Overview'}
          </h2>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
            {getCurrentMonthName(zh)} — {zh ? '已核准加班時數' : 'Approved Overtime Hours'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '16px', fontSize: '12px' }}>
          <span style={{ color: '#22c55e' }}>● {zh ? '正常 (0–38h)' : 'Normal (0–38h)'}</span>
          <span style={{ color: '#f59e0b' }}>● {zh ? '接近上限 (38–46h)' : 'Near Cap (38–46h)'}</span>
          <span style={{ color: '#f43f5e' }}>● {zh ? '超標 (>46h)' : 'Over Cap (>46h)'}</span>
        </div>
      </div>

      {riskLoading ? (
        <div className="card" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
          {zh ? '載入中…' : 'Loading…'}
        </div>
      ) : riskData.length === 0 ? (
        <div className="card" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
          {zh ? '暫無資料' : 'No data'}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '14px' }}>
          {riskData.map(({ user, approvedHours, threeMonthHours }) => {
            const monthlyCap = 46
            const pct = Math.min((approvedHours / monthlyCap) * 100, 100)
            const color = riskColor(approvedHours)
            const storeName = (user as any).store?.name ?? ''
            const threeMonthColor = threeMonthHours > 138 ? '#f43f5e' : threeMonthHours > 110 ? '#f59e0b' : 'var(--text-muted)'
            return (
              <div
                key={user.id}
                className="card"
                style={{ padding: '18px' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '14px' }}>{user.name}</div>
                    {storeName && (
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                        {storeName}
                      </div>
                    )}
                  </div>
                  <span
                    style={{
                      fontSize: '11px',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      background: `${color}22`,
                      color: color,
                      border: `1px solid ${color}44`,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {riskLabel(approvedHours, zh)}
                  </span>
                </div>

                {/* Hours display */}
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', alignItems: 'baseline' }}>
                  <span style={{ fontSize: '24px', fontWeight: 700, color }}>
                    {approvedHours.toFixed(1)}h
                  </span>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    {zh ? `月上限 ${monthlyCap}h (§32-1)` : `Cap ${monthlyCap}h/mo (§32-1)`}
                  </span>
                </div>

                {/* Progress bar */}
                <div style={{
                  height: '6px',
                  borderRadius: '3px',
                  background: 'var(--border-color)',
                  overflow: 'hidden',
                }}>
                  <div style={{
                    height: '100%',
                    width: `${pct}%`,
                    background: color,
                    borderRadius: '3px',
                    transition: 'width 0.4s ease',
                  }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px', fontSize: '11px', color: 'var(--text-muted)' }}>
                  <span>{zh ? `已使用 ${approvedHours.toFixed(1)}h / 上限 ${monthlyCap}h` : `Used ${approvedHours.toFixed(1)}h / ${monthlyCap}h`}</span>
                  <span>{pct.toFixed(0)}%</span>
                </div>

                {/* 3-month rolling window (§32-1: 138h cap) */}
                <div style={{ marginTop: '8px', padding: '6px 8px', borderRadius: '4px', background: 'var(--bg-primary)', fontSize: '11px' }}>
                  <span style={{ color: threeMonthColor }}>
                    {zh ? `三個月累計: ${threeMonthHours.toFixed(1)}h / 138h` : `3-month: ${threeMonthHours.toFixed(1)}h / 138h`}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
