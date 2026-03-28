import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useOrg } from '../lib/OrgContext';
import { getLocale } from '../lib/i18n';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Employee {
  id: string;
  name: string;
}

interface PerformanceReview {
  id: string;
  organization_id: string;
  employee_id: string;
  reviewer_id: string | null;
  period: string;
  period_type: string;
  overall_score: number | null;
  status: string;
  strengths: string | null;
  improvements: string | null;
  goals_next: string | null;
  notes: string | null;
  submitted_at: string | null;
  acknowledged_at: string | null;
  created_at: string;
  updated_at: string;
}

interface PerformanceKPI {
  id: string;
  review_id: string;
  kpi_name: string;
  description: string | null;
  target: string | null;
  actual: string | null;
  score: number | null;
  weight: number;
  created_at: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const REVIEW_STATUS: Record<string, { bg: string; color: string; label: string; labelEn: string }> = {
  draft:        { bg: '#f3f4f6', color: '#374151', label: '草稿',   labelEn: 'Draft' },
  submitted:    { bg: '#fef9c3', color: '#a16207', label: '已提交', labelEn: 'Submitted' },
  acknowledged: { bg: '#dbeafe', color: '#1d4ed8', label: '已確認', labelEn: 'Acknowledged' },
  closed:       { bg: '#dcfce7', color: '#15803d', label: '已結案', labelEn: 'Closed' },
};

const PERIOD_TYPES: { value: string; zh: string; en: string }[] = [
  { value: 'monthly',     zh: '月度', en: 'Monthly' },
  { value: 'quarterly',   zh: '季度', en: 'Quarterly' },
  { value: 'semi-annual', zh: '半年', en: 'Semi-annual' },
  { value: 'annual',      zh: '年度', en: 'Annual' },
];

function StatusBadge({ status, zh }: { status: string; zh: boolean }) {
  const s = REVIEW_STATUS[status] ?? REVIEW_STATUS.draft;
  return (
    <span style={{ background: s.bg, color: s.color, padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 600 }}>
      {zh ? s.label : s.labelEn}
    </span>
  );
}

function ScoreBar({ score, max = 10 }: { score: number | null; max?: number }) {
  if (score === null) return <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>—</span>;
  const pct = Math.min((score / max) * 100, 100);
  const hue = Math.round((pct / 100) * 120); // red=0 → green=120
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
      <div style={{ flex: 1, height: '6px', background: '#e5e7eb', borderRadius: '3px', overflow: 'hidden', minWidth: '60px' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: `hsl(${hue}, 60%, 45%)`, borderRadius: '3px', transition: 'width 0.3s' }} />
      </div>
      <span style={{ fontSize: '12px', fontWeight: 600, color: `hsl(${hue}, 60%, 40%)`, minWidth: '28px' }}>{score.toFixed(1)}</span>
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export function PerformanceManagement() {
  const { orgId, currentUser } = useOrg();
  const zh = getLocale() === 'zh-TW';

  const [tab, setTab] = useState<'reviews' | 'analytics'>('reviews');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [filterEmployee, setFilterEmployee] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  // Reviews
  const [reviews, setReviews] = useState<PerformanceReview[]>([]);
  const [selectedReview, setSelectedReview] = useState<PerformanceReview | null>(null);
  const [reviewKPIs, setReviewKPIs] = useState<PerformanceKPI[]>([]);
  const [showCreateReview, setShowCreateReview] = useState(false);
  const [reviewForm, setReviewForm] = useState({
    employee_id: '', period: '', period_type: 'quarterly', overall_score: '',
    strengths: '', improvements: '', goals_next: '', notes: '',
  });
  const [kpiRows, setKpiRows] = useState<{ kpi_name: string; description: string; target: string; actual: string; score: string; weight: string }[]>([]);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const empName = useCallback((id: string) => {
    const e = employees.find(emp => emp.id === id);
    return e?.name || id.slice(0, 8);
  }, [employees]);

  useEffect(() => {
    if (!orgId) return;
    supabase.from('users').select('id, name').eq('organization_id', orgId)
      .then(({ data }) => setEmployees(data || []));
  }, [orgId]);

  const loadReviews = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    let q = supabase.from('performance_reviews').select('*')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false });
    if (filterEmployee) q = q.eq('employee_id', filterEmployee);
    if (filterStatus) q = q.eq('status', filterStatus);
    const { data } = await q;
    setReviews(data || []);
    setLoading(false);
  }, [orgId, filterEmployee, filterStatus]);

  useEffect(() => { loadReviews(); }, [loadReviews]);

  const loadKPIs = async (reviewId: string) => {
    const { data } = await supabase.from('performance_kpis').select('*').eq('review_id', reviewId).order('created_at');
    setReviewKPIs(data || []);
  };

  const selectReview = (r: PerformanceReview) => {
    setSelectedReview(r);
    loadKPIs(r.id);
  };

  const saveReview = async () => {
    setError('');
    if (!reviewForm.employee_id) { setError(zh ? '請選擇員工' : 'Select an employee'); return; }
    if (!reviewForm.period.trim()) { setError(zh ? '請輸入考核期間' : 'Enter review period'); return; }
    setSaving(true);

    const { data: rev, error: revErr } = await supabase.from('performance_reviews').insert({
      organization_id: orgId,
      employee_id: reviewForm.employee_id,
      reviewer_id: currentUser?.id ?? null,
      period: reviewForm.period,
      period_type: reviewForm.period_type,
      status: 'draft',
      overall_score: reviewForm.overall_score ? parseFloat(reviewForm.overall_score) : null,
      strengths: reviewForm.strengths || null,
      improvements: reviewForm.improvements || null,
      goals_next: reviewForm.goals_next || null,
      notes: reviewForm.notes || null,
    }).select().single();

    if (revErr || !rev) { setError(revErr?.message ?? 'Error'); setSaving(false); return; }

    const kpisToInsert = kpiRows.filter(k => k.kpi_name.trim()).map(k => ({
      review_id: rev.id,
      kpi_name: k.kpi_name,
      description: k.description || null,
      target: k.target || null,
      actual: k.actual || null,
      score: k.score ? parseFloat(k.score) : null,
      weight: k.weight ? parseFloat(k.weight) : 1.0,
    }));
    if (kpisToInsert.length > 0) {
      await supabase.from('performance_kpis').insert(kpisToInsert);
    }

    setSaving(false);
    setShowCreateReview(false);
    setReviewForm({ employee_id: '', period: '', period_type: 'quarterly', overall_score: '', strengths: '', improvements: '', goals_next: '', notes: '' });
    setKpiRows([]);
    loadReviews();
  };

  const updateStatus = async (review: PerformanceReview, newStatus: string) => {
    const updates: Record<string, unknown> = { status: newStatus, updated_at: new Date().toISOString() };
    if (newStatus === 'submitted') updates.submitted_at = new Date().toISOString();
    if (newStatus === 'acknowledged') updates.acknowledged_at = new Date().toISOString();
    await supabase.from('performance_reviews').update(updates).eq('id', review.id);
    loadReviews();
    if (selectedReview?.id === review.id) setSelectedReview({ ...review, status: newStatus });
  };

  // Analytics
  const avgScore = reviews.filter(r => r.overall_score !== null).length > 0
    ? reviews.reduce((s, r) => s + (r.overall_score ?? 0), 0) / reviews.filter(r => r.overall_score !== null).length
    : null;

  return (
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 700, margin: 0 }}>
          ⭐ {zh ? '績效管理' : 'Performance Management'}
        </h1>
        <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--text-muted)' }}>
          {zh ? '績效考核與 KPI 追蹤' : 'Performance reviews and KPI tracking'}
        </p>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '12px', marginBottom: '20px' }}>
        {[
          { label: zh ? '總考核' : 'Reviews', value: reviews.length, color: '#6366f1' },
          { label: zh ? '草稿' : 'Draft', value: reviews.filter(r => r.status === 'draft').length, color: '#6b7280' },
          { label: zh ? '已提交' : 'Submitted', value: reviews.filter(r => r.status === 'submitted').length, color: '#f59e0b' },
          { label: zh ? '平均分數' : 'Avg Score', value: avgScore !== null ? avgScore.toFixed(1) : '—', color: '#16a34a' },
        ].map(s => (
          <div key={s.label} className="card" style={{ padding: '14px', textAlign: 'center' }}>
            <div style={{ fontSize: '22px', fontWeight: 700, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="tab-bar" style={{ marginBottom: '16px' }}>
        {([
          { key: 'reviews',   label: `🎯 ${zh ? '績效考核' : 'Reviews'} (${reviews.length})` },
          { key: 'analytics', label: `📊 ${zh ? '統計分析' : 'Analytics'}` },
        ] as const).map(({ key, label }) => (
          <button key={key} className={`tab-item ${tab === key ? 'active' : ''}`} onClick={() => setTab(key)}>
            {label}
          </button>
        ))}
      </div>

      {/* Filters + action */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <select className="input-field" style={{ flex: '1 1 200px', maxWidth: '280px' }} value={filterEmployee} onChange={e => setFilterEmployee(e.target.value)}>
          <option value="">{zh ? '所有員工' : 'All Employees'}</option>
          {employees.map(e => (
            <option key={e.id} value={e.id}>{e.name}</option>
          ))}
        </select>
        <select className="input-field" style={{ flex: '0 0 140px' }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">{zh ? '所有狀態' : 'All Status'}</option>
          {Object.entries(REVIEW_STATUS).map(([k, v]) => (
            <option key={k} value={k}>{zh ? v.label : v.labelEn}</option>
          ))}
        </select>
        {tab === 'reviews' && (
          <button className="btn btn-primary btn-sm" onClick={() => {
            setShowCreateReview(true);
            setKpiRows([{ kpi_name: '', description: '', target: '', actual: '', score: '', weight: '1' }]);
          }}>
            + {zh ? '新增考核' : 'New Review'}
          </button>
        )}
      </div>

      {/* ── Tab: Reviews ── */}
      {tab === 'reviews' && (
        <div style={{ display: 'flex', gap: '16px' }}>
          <div style={{ flex: '1 1 0', minWidth: 0 }}>
            {loading ? (
              <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>{zh ? '載入中…' : 'Loading…'}</div>
            ) : reviews.length === 0 ? (
              <div className="card" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                <div style={{ fontSize: '36px', marginBottom: '8px' }}>📝</div>
                {zh ? '尚無績效考核記錄' : 'No performance reviews yet'}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {reviews.map(r => (
                  <div
                    key={r.id}
                    className="card"
                    style={{
                      padding: '14px', cursor: 'pointer',
                      borderColor: selectedReview?.id === r.id ? 'var(--accent-blue)' : undefined,
                      borderWidth: selectedReview?.id === r.id ? '2px' : undefined,
                    }}
                    onClick={() => selectReview(r)}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '14px' }}>{empName(r.employee_id)}</div>
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                          {r.period} · {PERIOD_TYPES.find(p => p.value === r.period_type)?.[zh ? 'zh' : 'en'] ?? r.period_type}
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                        <StatusBadge status={r.status} zh={zh} />
                        <ScoreBar score={r.overall_score} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Review detail panel */}
          {selectedReview && (
            <div style={{ flex: '0 0 400px', position: 'sticky', top: '20px', alignSelf: 'flex-start' }}>
              <div className="card" style={{ padding: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <h3 style={{ margin: 0, fontSize: '15px' }}>{empName(selectedReview.employee_id)}</h3>
                  <button style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', color: 'var(--text-muted)' }} onClick={() => setSelectedReview(null)}>×</button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '13px', marginBottom: '12px' }}>
                  <div>
                    <span style={labelStyle}>{zh ? '期間' : 'Period'}</span>
                    <div>{selectedReview.period}</div>
                  </div>
                  <div>
                    <span style={labelStyle}>{zh ? '類型' : 'Type'}</span>
                    <div>{PERIOD_TYPES.find(p => p.value === selectedReview.period_type)?.[zh ? 'zh' : 'en'] ?? selectedReview.period_type}</div>
                  </div>
                  <div>
                    <span style={labelStyle}>{zh ? '狀態' : 'Status'}</span>
                    <div><StatusBadge status={selectedReview.status} zh={zh} /></div>
                  </div>
                  <div>
                    <span style={labelStyle}>{zh ? '總分' : 'Score'}</span>
                    <ScoreBar score={selectedReview.overall_score} />
                  </div>
                </div>

                {selectedReview.strengths && (
                  <div style={{ marginBottom: '8px' }}>
                    <span style={labelStyle}>{zh ? '優勢' : 'Strengths'}</span>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{selectedReview.strengths}</div>
                  </div>
                )}
                {selectedReview.improvements && (
                  <div style={{ marginBottom: '8px' }}>
                    <span style={labelStyle}>{zh ? '待改進' : 'Improvements'}</span>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{selectedReview.improvements}</div>
                  </div>
                )}
                {selectedReview.goals_next && (
                  <div style={{ marginBottom: '8px' }}>
                    <span style={labelStyle}>{zh ? '下期目標' : 'Next Goals'}</span>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{selectedReview.goals_next}</div>
                  </div>
                )}
                {selectedReview.notes && (
                  <div style={{ marginBottom: '12px' }}>
                    <span style={labelStyle}>{zh ? '備註' : 'Notes'}</span>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{selectedReview.notes}</div>
                  </div>
                )}

                {/* KPIs */}
                {reviewKPIs.length > 0 && (
                  <div style={{ marginBottom: '12px' }}>
                    <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>KPIs</div>
                    {reviewKPIs.map(k => (
                      <div key={k.id} style={{ fontSize: '12px', padding: '8px', background: 'var(--surface-2)', borderRadius: '6px', marginBottom: '4px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontWeight: 500 }}>{k.kpi_name}</span>
                          <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                            {zh ? '權重' : 'Weight'}: {k.weight}
                          </span>
                        </div>
                        {k.description && <div style={{ color: 'var(--text-muted)', fontSize: '11px', marginTop: '2px' }}>{k.description}</div>}
                        <div style={{ color: 'var(--text-muted)', marginTop: '4px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                          <span>{zh ? '目標' : 'Target'}: {k.target ?? '—'}</span>
                          <span>·</span>
                          <span>{zh ? '實際' : 'Actual'}: {k.actual ?? '—'}</span>
                          {k.score !== null && (
                            <span style={{ marginLeft: 'auto' }}><ScoreBar score={k.score} /></span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Status action buttons */}
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {selectedReview.status === 'draft' && (
                    <button className="btn btn-primary btn-sm" style={{ flex: 1 }} onClick={() => updateStatus(selectedReview, 'submitted')}>
                      📤 {zh ? '提交考核' : 'Submit'}
                    </button>
                  )}
                  {selectedReview.status === 'submitted' && (
                    <button className="btn btn-primary btn-sm" style={{ flex: 1 }} onClick={() => updateStatus(selectedReview, 'acknowledged')}>
                      ✓ {zh ? '確認' : 'Acknowledge'}
                    </button>
                  )}
                  {(selectedReview.status === 'submitted' || selectedReview.status === 'acknowledged') && (
                    <button className="btn btn-secondary btn-sm" style={{ flex: 1 }} onClick={() => updateStatus(selectedReview, 'closed')}>
                      🔒 {zh ? '結案' : 'Close'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Analytics ── */}
      {tab === 'analytics' && (
        <div>
          {reviews.length === 0 ? (
            <div className="card" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: '36px', marginBottom: '8px' }}>📊</div>
              {zh ? '尚無資料可供分析' : 'No data available for analytics'}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              {/* Score distribution */}
              <div className="card" style={{ padding: '16px' }}>
                <h3 style={{ fontSize: '14px', fontWeight: 600, margin: '0 0 12px' }}>{zh ? '分數分布' : 'Score Distribution'}</h3>
                {(() => {
                  const ranges = [
                    { label: '0-2', min: 0, max: 2, color: '#ef4444' },
                    { label: '3-4', min: 3, max: 4, color: '#f59e0b' },
                    { label: '5-6', min: 5, max: 6, color: '#eab308' },
                    { label: '7-8', min: 7, max: 8, color: '#22c55e' },
                    { label: '9-10', min: 9, max: 10, color: '#16a34a' },
                  ];
                  const scored = reviews.filter(r => r.overall_score !== null);
                  const maxCount = Math.max(1, ...ranges.map(rng => scored.filter(r => r.overall_score! >= rng.min && r.overall_score! <= rng.max).length));
                  return ranges.map(rng => {
                    const count = scored.filter(r => r.overall_score! >= rng.min && r.overall_score! <= rng.max).length;
                    return (
                      <div key={rng.label} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', fontSize: '12px' }}>
                        <span style={{ minWidth: '36px', color: 'var(--text-muted)' }}>{rng.label}</span>
                        <div style={{ flex: 1, height: '16px', background: '#f3f4f6', borderRadius: '4px', overflow: 'hidden' }}>
                          <div style={{ width: `${(count / maxCount) * 100}%`, height: '100%', background: rng.color, borderRadius: '4px', transition: 'width 0.3s' }} />
                        </div>
                        <span style={{ minWidth: '20px', textAlign: 'right', fontWeight: 600 }}>{count}</span>
                      </div>
                    );
                  });
                })()}
              </div>

              {/* Status breakdown */}
              <div className="card" style={{ padding: '16px' }}>
                <h3 style={{ fontSize: '14px', fontWeight: 600, margin: '0 0 12px' }}>{zh ? '狀態分布' : 'Status Breakdown'}</h3>
                {Object.entries(REVIEW_STATUS).map(([key, val]) => {
                  const count = reviews.filter(r => r.status === key).length;
                  return (
                    <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border-light, rgba(0,0,0,0.04))', fontSize: '13px' }}>
                      <StatusBadge status={key} zh={zh} />
                      <span style={{ fontWeight: 600 }}>{count}</span>
                    </div>
                  );
                })}
              </div>

              {/* Top performers */}
              <div className="card" style={{ padding: '16px', gridColumn: '1 / -1' }}>
                <h3 style={{ fontSize: '14px', fontWeight: 600, margin: '0 0 12px' }}>{zh ? '員工績效排名' : 'Employee Rankings'}</h3>
                {(() => {
                  const empScores = new Map<string, { total: number; count: number }>();
                  reviews.filter(r => r.overall_score !== null).forEach(r => {
                    const prev = empScores.get(r.employee_id) ?? { total: 0, count: 0 };
                    empScores.set(r.employee_id, { total: prev.total + r.overall_score!, count: prev.count + 1 });
                  });
                  const ranked = [...empScores.entries()]
                    .map(([id, { total, count }]) => ({ id, avg: total / count, count }))
                    .sort((a, b) => b.avg - a.avg);

                  if (ranked.length === 0) return <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>{zh ? '暫無評分資料' : 'No scores yet'}</div>;

                  return ranked.map((r, i) => (
                    <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '8px 0', borderBottom: '1px solid var(--border-light, rgba(0,0,0,0.04))' }}>
                      <span style={{ fontSize: '14px', fontWeight: 700, color: i < 3 ? '#f59e0b' : 'var(--text-muted)', minWidth: '24px' }}>
                        {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
                      </span>
                      <span style={{ flex: 1, fontWeight: 500, fontSize: '13px' }}>{empName(r.id)}</span>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{r.count} {zh ? '次考核' : 'reviews'}</span>
                      <div style={{ width: '120px' }}><ScoreBar score={r.avg} /></div>
                    </div>
                  ));
                })()}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Modal: Create Review ── */}
      {showCreateReview && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', overscrollBehavior: 'contain' }}
          onClick={e => { if (e.target === e.currentTarget) setShowCreateReview(false); }}>
          <div className="card" style={{ padding: '24px', width: '100%', maxWidth: '640px', maxHeight: '90vh', overflowY: 'auto' }}>
            <h2 style={{ fontSize: '16px', fontWeight: 600, margin: '0 0 16px' }}>{zh ? '新增績效考核' : 'New Performance Review'}</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={labelStyle}>{zh ? '員工 *' : 'Employee *'}</label>
                <select className="input-field" value={reviewForm.employee_id} onChange={e => setReviewForm(f => ({ ...f, employee_id: e.target.value }))}>
                  <option value="">{zh ? '選擇員工' : 'Select'}</option>
                  {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>{zh ? '考核期間 *' : 'Period *'}</label>
                <input className="input-field" placeholder="e.g. 2026-Q1" value={reviewForm.period} onChange={e => setReviewForm(f => ({ ...f, period: e.target.value }))} />
              </div>
              <div>
                <label style={labelStyle}>{zh ? '考核類型' : 'Type'}</label>
                <select className="input-field" value={reviewForm.period_type} onChange={e => setReviewForm(f => ({ ...f, period_type: e.target.value }))}>
                  {PERIOD_TYPES.map(p => <option key={p.value} value={p.value}>{zh ? p.zh : p.en}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>{zh ? '總分 (0–10)' : 'Score (0–10)'}</label>
                <input className="input-field" type="number" min="0" max="10" step="0.1" value={reviewForm.overall_score} onChange={e => setReviewForm(f => ({ ...f, overall_score: e.target.value }))} />
              </div>
              <div>
                <label style={labelStyle}>{zh ? '優勢' : 'Strengths'}</label>
                <textarea className="input-field" rows={2} value={reviewForm.strengths} onChange={e => setReviewForm(f => ({ ...f, strengths: e.target.value }))} />
              </div>
              <div>
                <label style={labelStyle}>{zh ? '待改進' : 'Improvements'}</label>
                <textarea className="input-field" rows={2} value={reviewForm.improvements} onChange={e => setReviewForm(f => ({ ...f, improvements: e.target.value }))} />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={labelStyle}>{zh ? '下期目標' : 'Next Period Goals'}</label>
                <textarea className="input-field" rows={2} value={reviewForm.goals_next} onChange={e => setReviewForm(f => ({ ...f, goals_next: e.target.value }))} />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={labelStyle}>{zh ? '備註' : 'Notes'}</label>
                <textarea className="input-field" rows={2} value={reviewForm.notes} onChange={e => setReviewForm(f => ({ ...f, notes: e.target.value }))} />
              </div>
            </div>

            {/* KPI rows */}
            <div style={{ marginTop: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '13px', fontWeight: 600 }}>KPIs</span>
                <button className="btn btn-secondary btn-sm" onClick={() => setKpiRows(r => [...r, { kpi_name: '', description: '', target: '', actual: '', score: '', weight: '1' }])}>
                  + {zh ? '新增 KPI' : 'Add KPI'}
                </button>
              </div>
              {kpiRows.map((k, i) => (
                <div key={i} style={{ padding: '8px', background: 'var(--surface-2)', borderRadius: '6px', marginBottom: '6px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 0.6fr 0.4fr auto', gap: '6px', alignItems: 'center' }}>
                    <input className="input-field" placeholder={zh ? 'KPI 名稱' : 'KPI Name'} value={k.kpi_name} onChange={e => { const rows = [...kpiRows]; rows[i].kpi_name = e.target.value; setKpiRows(rows); }} />
                    <input className="input-field" placeholder={zh ? '目標' : 'Target'} value={k.target} onChange={e => { const rows = [...kpiRows]; rows[i].target = e.target.value; setKpiRows(rows); }} />
                    <input className="input-field" placeholder={zh ? '實際' : 'Actual'} value={k.actual} onChange={e => { const rows = [...kpiRows]; rows[i].actual = e.target.value; setKpiRows(rows); }} />
                    <input className="input-field" type="number" min="0" max="10" step="0.1" placeholder={zh ? '分數' : 'Score'} value={k.score} onChange={e => { const rows = [...kpiRows]; rows[i].score = e.target.value; setKpiRows(rows); }} />
                    <input className="input-field" type="number" min="0" step="0.1" placeholder={zh ? '權重' : 'Wt'} value={k.weight} onChange={e => { const rows = [...kpiRows]; rows[i].weight = e.target.value; setKpiRows(rows); }} />
                    <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontSize: '16px' }} onClick={() => setKpiRows(r => r.filter((_, j) => j !== i))}>×</button>
                  </div>
                  <input className="input-field" style={{ marginTop: '4px' }} placeholder={zh ? '說明' : 'Description'} value={k.description} onChange={e => { const rows = [...kpiRows]; rows[i].description = e.target.value; setKpiRows(rows); }} />
                </div>
              ))}
            </div>

            {error && <div style={{ color: '#dc2626', fontSize: '13px', marginTop: '8px' }}>{error}</div>}
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '16px' }}>
              <button className="btn btn-secondary" onClick={() => setShowCreateReview(false)}>{zh ? '取消' : 'Cancel'}</button>
              <button className="btn btn-primary" onClick={saveReview} disabled={saving}>{saving ? '…' : (zh ? '儲存' : 'Save')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Style constants ──────────────────────────────────────────────────────────

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)',
  marginBottom: '3px', textTransform: 'uppercase',
};
