import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Badge, formatDateOnly, todayISO, TagList } from '../../lib/lineLogsConstants';
import type { DailySummary, WeeklySummary, MonthlySummary, SummaryView } from '../../types/lineLogs';

// ── Props ────────────────────────────────────────────────────────────────────

interface SummaryTabProps {
  zh: boolean;
  loading: boolean;
  filterGroup: string;
  expandedId: string | null;
  setExpandedId: (id: string | null) => void;
  summaries: DailySummary[];
  weeklySummaries: WeeklySummary[];
  monthlySummaries: MonthlySummary[];
  summaryView: SummaryView;
  setSummaryView: (view: SummaryView) => void;
  loadData: () => void;
  search: string;
}

// ── Component ────────────────────────────────────────────────────────────────

export function SummaryTab({
  zh, loading, filterGroup, expandedId, setExpandedId,
  summaries, weeklySummaries, monthlySummaries,
  summaryView, setSummaryView, loadData, search,
}: SummaryTabProps) {
  const [generating, setGenerating] = useState(false);
  const [summaryDate, setSummaryDate] = useState(todayISO());

  const s = search.toLowerCase();

  const filteredSummaries = summaries.filter(sm =>
    !s || (sm.group_name ?? '').toLowerCase().includes(s) || sm.summary_text.toLowerCase().includes(s)
  );

  // ── Generate daily summary ──────────────────────────────
  const handleGenerateSummary = async () => {
    setGenerating(true);
    const { data, error } = await supabase.rpc('generate_daily_summary', { target_date: summaryDate });
    setGenerating(false);
    if (error) {
      alert(zh ? `產生摘要失敗: ${error.message}` : `Failed to generate summary: ${error.message}`);
    } else {
      alert(zh ? `已產生 ${data} 筆群組摘要` : `Generated ${data} group summaries`);
      loadData();
    }
  };

  // ── Generate weekly/monthly summary ─────────────────────
  const handleGenerateTiered = async (tier: 'weekly' | 'monthly') => {
    setGenerating(true);
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      const resp = await fetch(`${supabaseUrl}/functions/v1/summarize-history`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseKey}`,
        },
        body: JSON.stringify({ tier, group_id: filterGroup || undefined }),
      });
      const result = await resp.json();
      if (resp.ok) {
        alert(zh ? `已產生 ${result.processed ?? 0} 筆${tier === 'weekly' ? '週' : '月'}摘要` : `Generated ${result.processed ?? 0} ${tier} summaries`);
        loadData();
      } else {
        alert(zh ? `產生失敗: ${result.error}` : `Failed: ${result.error}`);
      }
    } catch (e: any) {
      alert(zh ? `產生失敗: ${e.message}` : `Failed: ${e.message}`);
    }
    setGenerating(false);
  };

  return (
    <>
      {/* Sub-tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        {([
          { key: 'daily' as SummaryView, label: zh ? '每日' : 'Daily' },
          { key: 'weekly' as SummaryView, label: zh ? '每週' : 'Weekly' },
          { key: 'monthly' as SummaryView, label: zh ? '每月' : 'Monthly' },
        ]).map(({ key, label }) => (
          <button
            key={key}
            className={`btn btn-sm ${summaryView === key ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setSummaryView(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {summaryView === 'daily' && renderDailySummaries()}
      {summaryView === 'weekly' && renderWeeklySummaries()}
      {summaryView === 'monthly' && renderMonthlySummaries()}
    </>
  );

  // ── Daily Summaries ─────────────────────────────────────
  function renderDailySummaries() {
    return (
      <>
        {/* Generate controls */}
        <div className="card" style={{ padding: '14px', marginBottom: '16px', display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '13px', fontWeight: 600 }}>{zh ? '產生每日摘要：' : 'Generate daily summary:'}</span>
          <input type="date" className="input-field" style={{ width: '160px' }} value={summaryDate} onChange={e => setSummaryDate(e.target.value)} />
          <button className="btn btn-primary btn-sm" onClick={handleGenerateSummary} disabled={generating}>
            {generating ? (zh ? '產生中…' : 'Generating…') : (zh ? '產生摘要' : 'Generate')}
          </button>
        </div>

        {loading ? (
          <div className="card" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
            {zh ? '載入中…' : 'Loading…'}
          </div>
        ) : filteredSummaries.length === 0 ? (
          <div className="card" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
            <div style={{ fontSize: '36px', marginBottom: '8px' }}>📭</div>
            {zh ? '尚無摘要記錄，請先點擊「產生摘要」' : 'No summaries yet. Click "Generate" to create one.'}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {filteredSummaries.map(sm => (
              <div key={sm.id} className="card" style={{ padding: '16px', cursor: 'pointer' }} onClick={() => setExpandedId(expandedId === sm.id ? null : sm.id)}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 600, fontSize: '14px' }}>{sm.group_name ?? sm.group_id.slice(0, 12)}</span>
                    <Badge bg="#f3f4f6" color="#374151">{formatDateOnly(sm.summary_date)}</Badge>
                    <Badge bg="#dbeafe" color="#1d4ed8">{sm.message_count} {zh ? '則訊息' : 'msgs'}</Badge>
                    <Badge bg="#dcfce7" color="#15803d">{sm.unique_users ?? 0} {zh ? '位用戶' : 'users'}</Badge>
                  </div>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    {expandedId === sm.id ? '▲' : '▼'}
                  </span>
                </div>
                {sm.user_names && sm.user_names.length > 0 && (
                  <div style={{ marginTop: '6px', fontSize: '12px', color: 'var(--text-muted)' }}>
                    {zh ? '參與者：' : 'Users: '}{sm.user_names.join(', ')}
                  </div>
                )}
                {expandedId === sm.id && (
                  <pre style={{
                    marginTop: '12px', padding: '12px', background: 'var(--surface-2)',
                    borderRadius: '8px', fontSize: '12px', lineHeight: '1.6',
                    whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: '400px', overflow: 'auto',
                  }}>
                    {sm.summary_text || (zh ? '(無內容)' : '(empty)')}
                  </pre>
                )}
              </div>
            ))}
          </div>
        )}
      </>
    );
  }

  // ── Weekly Summaries ────────────────────────────────────
  function renderWeeklySummaries() {
    return (
      <>
        <div className="card" style={{ padding: '14px', marginBottom: '16px', display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '13px', fontWeight: 600 }}>{zh ? '手動產生週摘要：' : 'Generate weekly summary:'}</span>
          <button className="btn btn-primary btn-sm" onClick={() => handleGenerateTiered('weekly')} disabled={generating}>
            {generating ? (zh ? '產生中…' : 'Generating…') : (zh ? '產生上週摘要' : 'Generate Last Week')}
          </button>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            {zh ? '（自動：每週一 7:00 AM）' : '(Auto: Mon 7:00 AM)'}
          </span>
        </div>

        {loading ? (
          <div className="card" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>{zh ? '載入中…' : 'Loading…'}</div>
        ) : weeklySummaries.length === 0 ? (
          <div className="card" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
            <div style={{ fontSize: '36px', marginBottom: '8px' }}>📭</div>
            {zh ? '尚無週摘要' : 'No weekly summaries yet'}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {weeklySummaries.map(ws => (
              <div key={ws.id} className="card" style={{ padding: '16px', cursor: 'pointer' }} onClick={() => setExpandedId(expandedId === ws.id ? null : ws.id)}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 600, fontSize: '14px' }}>{ws.group_name ?? ws.group_id.slice(0, 12)}</span>
                    <Badge bg="#f3f4f6" color="#374151">{ws.week_start} ~ {ws.week_end}</Badge>
                    <Badge bg="#dbeafe" color="#1d4ed8">{ws.message_count} {zh ? '則訊息' : 'msgs'}</Badge>
                    <Badge bg="#dcfce7" color="#15803d">{ws.unique_users ?? 0} {zh ? '位用戶' : 'users'}</Badge>
                    {(ws.context as any)?.model && (
                      <Badge bg="#fef3c7" color="#92400e">{(ws.context as any).model}</Badge>
                    )}
                  </div>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{expandedId === ws.id ? '▲' : '▼'}</span>
                </div>
                {ws.user_names && ws.user_names.length > 0 && (
                  <div style={{ marginTop: '6px', fontSize: '12px', color: 'var(--text-muted)' }}>
                    {zh ? '參與者：' : 'Users: '}{ws.user_names.join(', ')}
                  </div>
                )}
                {expandedId === ws.id && (
                  <div style={{ marginTop: '12px' }}>
                    <TagList items={ws.key_decisions} bg="#dbeafe" color="#1d4ed8" label={zh ? '重要決策' : 'Key Decisions'} />
                    <TagList items={ws.action_items} bg="#fee2e2" color="#b91c1c" label={zh ? '待辦事項' : 'Action Items'} />
                    <TagList items={ws.recurring_topics} bg="#f3e8ff" color="#7e22ce" label={zh ? '重複主題' : 'Recurring Topics'} />
                    <div style={{ marginTop: '12px' }}>
                      <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>
                        {zh ? '摘要' : 'Summary'}
                      </div>
                      <div style={{
                        padding: '12px', background: 'var(--surface-2)', borderRadius: '8px',
                        fontSize: '13px', lineHeight: '1.7', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                        maxHeight: '400px', overflow: 'auto',
                      }}>
                        {ws.summary_text || (zh ? '(無內容)' : '(empty)')}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </>
    );
  }

  // ── Monthly Summaries ───────────────────────────────────
  function renderMonthlySummaries() {
    return (
      <>
        <div className="card" style={{ padding: '14px', marginBottom: '16px', display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '13px', fontWeight: 600 }}>{zh ? '手動產生月摘要：' : 'Generate monthly summary:'}</span>
          <button className="btn btn-primary btn-sm" onClick={() => handleGenerateTiered('monthly')} disabled={generating}>
            {generating ? (zh ? '產生中…' : 'Generating…') : (zh ? '產生上月摘要' : 'Generate Last Month')}
          </button>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            {zh ? '（自動：每月 1 號 8:30 AM）' : '(Auto: 1st of month 8:30 AM)'}
          </span>
        </div>

        {loading ? (
          <div className="card" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>{zh ? '載入中…' : 'Loading…'}</div>
        ) : monthlySummaries.length === 0 ? (
          <div className="card" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
            <div style={{ fontSize: '36px', marginBottom: '8px' }}>📭</div>
            {zh ? '尚無月摘要' : 'No monthly summaries yet'}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {monthlySummaries.map(ms => (
              <div key={ms.id} className="card" style={{ padding: '16px', cursor: 'pointer' }} onClick={() => setExpandedId(expandedId === ms.id ? null : ms.id)}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 600, fontSize: '14px' }}>{ms.group_name ?? ms.group_id.slice(0, 12)}</span>
                    <Badge bg="#f3f4f6" color="#374151">{ms.summary_month.slice(0, 7)}</Badge>
                    <Badge bg="#dbeafe" color="#1d4ed8">{ms.message_count} {zh ? '則訊息' : 'msgs'}</Badge>
                    <Badge bg="#dcfce7" color="#15803d">{ms.unique_users ?? 0} {zh ? '位用戶' : 'users'}</Badge>
                    {(ms.context as any)?.model && (
                      <Badge bg="#fef3c7" color="#92400e">{(ms.context as any).model}</Badge>
                    )}
                  </div>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{expandedId === ms.id ? '▲' : '▼'}</span>
                </div>
                {ms.user_names && ms.user_names.length > 0 && (
                  <div style={{ marginTop: '6px', fontSize: '12px', color: 'var(--text-muted)' }}>
                    {zh ? '參與者：' : 'Users: '}{ms.user_names.join(', ')}
                  </div>
                )}
                {expandedId === ms.id && (
                  <div style={{ marginTop: '12px' }}>
                    <TagList items={ms.key_decisions} bg="#dbeafe" color="#1d4ed8" label={zh ? '重大決策' : 'Key Decisions'} />
                    <TagList items={ms.action_items} bg="#fee2e2" color="#b91c1c" label={zh ? '待辦事項' : 'Action Items'} />
                    <TagList items={ms.recurring_topics} bg="#f3e8ff" color="#7e22ce" label={zh ? '重複主題' : 'Recurring Topics'} />
                    <TagList items={ms.notable_events} bg="#fef3c7" color="#92400e" label={zh ? '重要事件' : 'Notable Events'} />
                    <div style={{ marginTop: '12px' }}>
                      <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>
                        {zh ? '摘要' : 'Summary'}
                      </div>
                      <div style={{
                        padding: '12px', background: 'var(--surface-2)', borderRadius: '8px',
                        fontSize: '13px', lineHeight: '1.7', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                        maxHeight: '500px', overflow: 'auto',
                      }}>
                        {ms.summary_text || (zh ? '(無內容)' : '(empty)')}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </>
    );
  }
}
