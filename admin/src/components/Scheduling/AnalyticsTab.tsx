import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

export interface AnalyticsTabProps {
  zh: boolean;
  selectedStore: string;
  orgId: string | null;
}

export function AnalyticsTab({ zh, selectedStore, orgId }: AnalyticsTabProps) {
  const [kpis, setKpis] = useState<any[]>([]);
  const [kpiLoading, setKpiLoading] = useState(true);

  useEffect(() => {
    if (!selectedStore || !orgId) return;
    supabase.from('scheduling_kpis').select('*')
      .eq('store_id', selectedStore).order('week_start', { ascending: false }).limit(12)
      .then(r => { setKpis(r.data || []); setKpiLoading(false); });
  }, [selectedStore, orgId]);

  if (kpiLoading) return <p className="loading-pulse">{zh ? '載入中...' : 'Loading...'}</p>;
  if (kpis.length === 0) return (
    <div>
      <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '16px' }}>📊 {zh ? '排班分析報表' : 'Scheduling Analytics'}</h3>
      <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
        {zh ? '尚無分析數據。發佈班表後會自動記錄 KPI。' : 'No analytics data yet. KPIs are recorded when you publish a schedule.'}
      </p>
    </div>
  );

  const maxHours = Math.max(...kpis.map(k => k.total_hours || 0), 1);

  return (
    <div>
      <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '16px' }}>📊 {zh ? '排班分析報表' : 'Scheduling Analytics'}</h3>
      <div style={{ display: 'grid', gap: '16px' }}>
        {/* Summary cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px' }}>
          <div className="card" style={{ padding: '14px', textAlign: 'center' }}>
            <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--accent-primary)' }}>{kpis.length}</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{zh ? '週數據' : 'Weeks tracked'}</div>
          </div>
          <div className="card" style={{ padding: '14px', textAlign: 'center' }}>
            <div style={{ fontSize: '24px', fontWeight: 700, color: '#22c55e' }}>
              {kpis.filter(k => k.ai_generated).length}/{kpis.length}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{zh ? 'AI 排班率' : 'AI generated'}</div>
          </div>
          <div className="card" style={{ padding: '14px', textAlign: 'center' }}>
            <div style={{ fontSize: '24px', fontWeight: 700, color: '#f59e0b' }}>
              {(kpis.reduce((s, k) => s + (k.total_ot_hours || 0), 0) / kpis.length).toFixed(1)}h
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{zh ? '平均週加班' : 'Avg OT/week'}</div>
          </div>
          <div className="card" style={{ padding: '14px', textAlign: 'center' }}>
            <div style={{ fontSize: '24px', fontWeight: 700, color: '#f43f5e' }}>
              {(kpis.reduce((s, k) => s + (k.violations_at_publish || 0), 0) / kpis.length).toFixed(1)}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{zh ? '平均違規數' : 'Avg violations'}</div>
          </div>
        </div>

        {/* Weekly trend bars */}
        <div className="card">
          <h4 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px' }}>{zh ? '每週趨勢' : 'Weekly Trends'}</h4>
          <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--outline-variant)' }}>
                <th style={{ padding: '6px 8px', textAlign: 'left' }}>{zh ? '週次' : 'Week'}</th>
                <th style={{ padding: '6px 8px', textAlign: 'right' }}>{zh ? '工時' : 'Hours'}</th>
                <th style={{ padding: '6px 8px', textAlign: 'left', width: '30%' }}></th>
                <th style={{ padding: '6px 8px', textAlign: 'right' }}>{zh ? '成本' : 'Cost'}</th>
                <th style={{ padding: '6px 8px', textAlign: 'right' }}>{zh ? '加班' : 'OT'}</th>
                <th style={{ padding: '6px 8px', textAlign: 'center' }}>{zh ? '違規' : 'Viol.'}</th>
                <th style={{ padding: '6px 8px', textAlign: 'center' }}>{zh ? '來源' : 'Source'}</th>
              </tr>
            </thead>
            <tbody>
              {kpis.map(k => (
                <tr key={k.id} style={{ borderBottom: '1px solid var(--outline-variant)' }}>
                  <td style={{ padding: '6px 8px', fontWeight: 500 }}>{k.week_start}</td>
                  <td style={{ padding: '6px 8px', textAlign: 'right' }}>{(k.total_hours || 0).toFixed(0)}h</td>
                  <td style={{ padding: '6px 8px' }}>
                    <div style={{ background: 'var(--bg-primary)', borderRadius: '4px', height: '8px', width: '100%' }}>
                      <div style={{ background: '#6366f1', borderRadius: '4px', height: '8px', width: `${((k.total_hours || 0) / maxHours) * 100}%` }} />
                    </div>
                  </td>
                  <td style={{ padding: '6px 8px', textAlign: 'right' }}>NT${Math.round(k.labor_cost || 0).toLocaleString()}</td>
                  <td style={{ padding: '6px 8px', textAlign: 'right', color: (k.total_ot_hours || 0) > 0 ? '#f59e0b' : 'var(--text-muted)' }}>
                    {(k.total_ot_hours || 0).toFixed(1)}h
                  </td>
                  <td style={{ padding: '6px 8px', textAlign: 'center', color: (k.violations_at_publish || 0) > 0 ? '#f43f5e' : '#22c55e' }}>
                    {k.violations_at_publish || 0}
                  </td>
                  <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                    {k.ai_generated ? '🤖' : '✏️'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
