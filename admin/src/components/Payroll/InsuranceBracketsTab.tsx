import type { InsBracket } from '../../types/payroll'
import { fmt } from './shared'

// ─── Props ────────────────────────────────────────────────────────────────────

interface InsuranceBracketsTabProps {
  zh: boolean
  laborBrackets: InsBracket[]
  healthBrackets: InsBracket[]
  bracketsLoading: boolean
  bracketYear: number
  setBracketYear: (v: number) => void
}

// ─── Component ────────────────────────────────────────────────────────────────

export function InsuranceBracketsTab({
  zh,
  laborBrackets,
  healthBrackets,
  bracketsLoading,
  bracketYear,
  setBracketYear,
}: InsuranceBracketsTabProps) {
  return (
    <div>
      <div style={{ marginBottom: '16px' }}>
        <h2 style={{ fontSize: '16px', fontWeight: 600, margin: 0 }}>
          {zh ? '保費對照表' : 'Insurance Premium Reference'}
        </h2>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
          {zh
            ? '勞保與健保投保薪資分級表（單位：新台幣）'
            : 'Labor and Health Insurance salary bracket tables (NTD)'}
        </p>
      </div>

      <div style={{ marginBottom: '16px' }}>
        <label style={{ fontSize: '13px', fontWeight: 500, marginRight: '8px' }}>
          {zh ? '年度：' : 'Year:'}
        </label>
        <select
          value={bracketYear}
          onChange={e => setBracketYear(Number(e.target.value))}
          style={{ fontSize: '13px', padding: '4px 8px', borderRadius: '6px', border: '1px solid var(--outline-variant)', background: 'var(--bg-card)', color: 'var(--text-primary)' }}
        >
          {[2020, 2021, 2022, 2023, 2024, 2025, 2026].map(y => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>

      {bracketsLoading ? (
        <div className="card" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
          {zh ? '載入中…' : 'Loading…'}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          {/* Labor Insurance Brackets */}
          <div className="card" style={{ overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--outline-variant)' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 700, margin: 0 }}>
                {zh ? '勞工保險' : 'Labor Insurance'}
              </h3>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '4px 0 0' }}>
                {zh ? '月投保薪資分級' : 'Monthly Insured Salary Grades'}
              </p>
            </div>
            {laborBrackets.length === 0 ? (
              <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                {zh ? '尚無資料' : 'No data'}
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <BracketTable brackets={laborBrackets} zh={zh} />
              </div>
            )}
          </div>

          {/* Health Insurance Brackets */}
          <div className="card" style={{ overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--outline-variant)' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 700, margin: 0 }}>
                {zh ? '全民健康保險' : 'National Health Insurance'}
              </h3>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '4px 0 0' }}>
                {zh ? '月投保金額分級（含眷屬加乘）' : 'Monthly premium grades (incl. dependents multiplier)'}
              </p>
            </div>
            {healthBrackets.length === 0 ? (
              <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                {zh ? '尚無資料' : 'No data'}
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <BracketTable brackets={healthBrackets} zh={zh} isHealth />
              </div>
            )}
          </div>
        </div>
      )}

      {/* NHI dependent note */}
      <div
        style={{
          marginTop: '16px',
          padding: '12px 16px',
          borderRadius: 'var(--radius-md)',
          background: 'rgba(59,130,246,0.08)',
          border: '1px solid rgba(59,130,246,0.2)',
          fontSize: '13px',
          color: 'var(--text-muted)',
        }}
      >
        <strong style={{ color: '#60a5fa' }}>
          {zh ? '眷屬加乘說明：' : 'Dependent Multiplier Note: '}
        </strong>
        {zh
          ? '健保員工保費依投保眷屬人數加乘計算。薪資結構中的「健保眷屬人數」欄位設定 0 表示僅本人，1 表示本人 + 1 位眷屬，以此類推。'
          : 'The employee NHI premium is multiplied by (1 + number of dependents). A value of 0 in the salary structure means employee only, 1 means employee + 1 dependent, etc.'}
      </div>
    </div>
  )
}

// ─── BracketTable sub-component ───────────────────────────────────────────────

function BracketTable({ brackets, zh, isHealth }: { brackets: InsBracket[]; zh: boolean; isHealth?: boolean }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
      <thead>
        <tr style={{ borderBottom: '1px solid var(--outline-variant)' }}>
          {[
            zh ? '級距' : 'Grade',
            zh ? '月薪下限' : 'Min Salary',
            isHealth ? (zh ? '投保金額' : 'Insured Amount') : (zh ? '投保薪資' : 'Insured Salary'),
            zh ? '員工保費' : 'Employee Premium',
            zh ? '雇主保費' : 'Employer Premium',
          ].map(h => (
            <th
              key={h}
              style={{
                padding: '10px 12px',
                textAlign: 'right',
                color: 'var(--text-muted)',
                fontWeight: 500,
                fontSize: '11px',
                whiteSpace: 'nowrap',
              }}
            >
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {brackets.map((b, idx) => (
          <tr
            key={b.grade}
            style={{
              borderBottom: '1px solid var(--outline-variant)',
              background: idx % 2 === 0 ? 'transparent' : 'var(--bg-secondary)',
            }}
          >
            <td style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--text-muted)' }}>
              {b.grade}
            </td>
            <td style={{ padding: '8px 12px', textAlign: 'right' }}>
              ${fmt(b.min_salary)}
            </td>
            <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600 }}>
              ${fmt(b.insured_salary)}
            </td>
            <td style={{ padding: '8px 12px', textAlign: 'right', color: '#f43f5e' }}>
              ${fmt(b.employee_premium)}
            </td>
            <td style={{ padding: '8px 12px', textAlign: 'right', color: '#f59e0b' }}>
              ${fmt(b.employer_premium)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
