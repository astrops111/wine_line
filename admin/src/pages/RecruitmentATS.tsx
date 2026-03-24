import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useOrg } from '../lib/OrgContext';
import { getLocale } from '../lib/i18n';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Employee {
  id: string;
  display_name: string | null;
  line_display_name: string | null;
}

interface JobPosting {
  id: string;
  org_id: string;
  title: string;
  department: string | null;
  location: string | null;
  job_type: string | null;
  status: string;
  description: string | null;
  requirements: string | null;
  salary_min: number | null;
  salary_max: number | null;
  headcount: number;
  posted_at: string | null;
  closes_at: string | null;
  created_by: string | null;
  created_at: string;
}

interface Candidate {
  id: string;
  org_id: string;
  job_id: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  stage: string;
  source: string | null;
  resume_path: string | null;
  notes: string | null;
  rating: number | null;
  assigned_to: string | null;
  created_at: string;
}

interface Interview {
  id: string;
  org_id: string;
  candidate_id: string;
  scheduled_at: string | null;
  interviewer_id: string | null;
  interview_type: string | null;
  status: string;
  feedback: string | null;
  score: number | null;
  created_at: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const JOB_STATUS: Record<string, { bg: string; color: string; label: string; labelEn: string }> = {
  draft:  { bg: '#f3f4f6', color: '#374151', label: '草稿',  labelEn: 'Draft' },
  open:   { bg: '#dcfce7', color: '#15803d', label: '招募中', labelEn: 'Open' },
  closed: { bg: '#fee2e2', color: '#b91c1c', label: '已關閉', labelEn: 'Closed' },
  filled: { bg: '#dbeafe', color: '#1d4ed8', label: '已錄用', labelEn: 'Filled' },
};

const STAGES: { key: string; label: string; labelEn: string; bg: string; color: string }[] = [
  { key: 'applied',   label: '已投遞', labelEn: 'Applied',   bg: '#f3f4f6', color: '#374151' },
  { key: 'screening', label: '初篩',   labelEn: 'Screening', bg: '#dbeafe', color: '#1d4ed8' },
  { key: 'interview', label: '面試',   labelEn: 'Interview', bg: '#fef9c3', color: '#a16207' },
  { key: 'offer',     label: '錄取通知', labelEn: 'Offer',   bg: '#fed7aa', color: '#c2410c' },
  { key: 'hired',     label: '已入職', labelEn: 'Hired',     bg: '#dcfce7', color: '#15803d' },
  { key: 'rejected',  label: '未錄取', labelEn: 'Rejected',  bg: '#fee2e2', color: '#b91c1c' },
];

const INTERVIEW_TYPES = [
  { key: 'phone',     label: '電話',   labelEn: 'Phone' },
  { key: 'video',     label: '視訊',   labelEn: 'Video' },
  { key: 'onsite',    label: '現場',   labelEn: 'Onsite' },
  { key: 'technical', label: '技術',   labelEn: 'Technical' },
  { key: 'hr',        label: 'HR',     labelEn: 'HR' },
];

function JobStatusBadge({ status, zh }: { status: string; zh: boolean }) {
  const s = JOB_STATUS[status] ?? JOB_STATUS.draft;
  return <span style={{ background: s.bg, color: s.color, padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 600 }}>{zh ? s.label : s.labelEn}</span>;
}

function StageBadge({ stage, zh }: { stage: string; zh: boolean }) {
  const s = STAGES.find(x => x.key === stage) ?? STAGES[0];
  return <span style={{ background: s.bg, color: s.color, padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 600 }}>{zh ? s.label : s.labelEn}</span>;
}

function RatingStars({ rating }: { rating: number | null }) {
  if (!rating) return null;
  return <span>{[1,2,3,4,5].map(i => <span key={i} style={{ color: i <= rating ? '#f59e0b' : '#d1d5db', fontSize: '12px' }}>★</span>)}</span>;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function RecruitmentATS() {
  const { orgId, currentUser } = useOrg();
  const zh = getLocale() === 'zh-TW';

  const [tab, setTab] = useState<'jobs' | 'candidates' | 'interviews'>('jobs');
  const [employees, setEmployees] = useState<Employee[]>([]);

  // Jobs
  const [jobs, setJobs] = useState<JobPosting[]>([]);
  const [selectedJob, setSelectedJob] = useState<JobPosting | null>(null);
  const [showCreateJob, setShowCreateJob] = useState(false);
  const [jobForm, setJobForm] = useState({ title: '', department: '', location: '', job_type: 'full-time', status: 'draft', description: '', requirements: '', salary_min: '', salary_max: '', headcount: '1' });

  // Candidates
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [filterJob, setFilterJob] = useState('');
  const [filterStage, setFilterStage] = useState('');
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null);
  const [showCreateCandidate, setShowCreateCandidate] = useState(false);
  const [candidateForm, setCandidateForm] = useState({ name: '', email: '', phone: '', job_id: '', stage: 'applied', source: '', notes: '', rating: '' });

  // Interviews
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [showCreateInterview, setShowCreateInterview] = useState(false);
  const [interviewForm, setInterviewForm] = useState({ candidate_id: '', interviewer_id: '', scheduled_at: '', interview_type: 'onsite', feedback: '', score: '' });

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!orgId) return;
    supabase.from('users').select('id, display_name, line_display_name').eq('org_id', orgId)
      .then(({ data }) => setEmployees(data || []));
  }, [orgId]);

  const empName = useCallback((id: string | null) => {
    if (!id) return '—';
    const e = employees.find(e => e.id === id);
    return e?.display_name || e?.line_display_name || id.slice(0, 8);
  }, [employees]);

  const loadJobs = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    const { data } = await supabase.from('job_postings').select('*').eq('org_id', orgId).order('created_at', { ascending: false });
    setJobs(data || []);
    setLoading(false);
  }, [orgId]);

  const loadCandidates = useCallback(async () => {
    if (!orgId) return;
    let q = supabase.from('candidates').select('*').eq('org_id', orgId).order('created_at', { ascending: false });
    if (filterJob)   q = q.eq('job_id', filterJob);
    if (filterStage) q = q.eq('stage', filterStage);
    const { data } = await q;
    setCandidates(data || []);
  }, [orgId, filterJob, filterStage]);

  const loadInterviews = useCallback(async () => {
    if (!orgId) return;
    const { data } = await supabase.from('interviews').select('*').eq('org_id', orgId).order('scheduled_at', { ascending: true });
    setInterviews(data || []);
  }, [orgId]);

  useEffect(() => { loadJobs(); loadCandidates(); loadInterviews(); }, [loadJobs, loadCandidates, loadInterviews]);

  // Stats
  const openJobs = jobs.filter(j => j.status === 'open').length;
  const thisMonth = new Date(); thisMonth.setDate(1); thisMonth.setHours(0, 0, 0, 0);
  const newCandidates = candidates.filter(c => new Date(c.created_at) >= thisMonth).length;
  const upcomingInterviews = interviews.filter(i => i.status === 'scheduled' && i.scheduled_at && new Date(i.scheduled_at) >= new Date()).length;
  const offers = candidates.filter(c => c.stage === 'offer').length;

  const saveJob = async () => {
    setError('');
    if (!jobForm.title.trim()) { setError(zh ? '請填寫職缺名稱' : 'Enter job title'); return; }
    setSaving(true);
    await supabase.from('job_postings').insert({
      org_id: orgId,
      title: jobForm.title,
      department: jobForm.department || null,
      location: jobForm.location || null,
      job_type: jobForm.job_type,
      status: jobForm.status,
      description: jobForm.description || null,
      requirements: jobForm.requirements || null,
      salary_min: jobForm.salary_min ? parseInt(jobForm.salary_min) : null,
      salary_max: jobForm.salary_max ? parseInt(jobForm.salary_max) : null,
      headcount: parseInt(jobForm.headcount) || 1,
      created_by: currentUser?.id ?? null,
      posted_at: jobForm.status === 'open' ? new Date().toISOString() : null,
    });
    setSaving(false);
    setShowCreateJob(false);
    setJobForm({ title: '', department: '', location: '', job_type: 'full-time', status: 'draft', description: '', requirements: '', salary_min: '', salary_max: '', headcount: '1' });
    loadJobs();
  };

  const updateJobStatus = async (job: JobPosting, status: string) => {
    await supabase.from('job_postings').update({
      status,
      posted_at: status === 'open' ? new Date().toISOString() : job.posted_at,
    }).eq('id', job.id);
    loadJobs();
    if (selectedJob?.id === job.id) setSelectedJob({ ...job, status });
  };

  const saveCandidate = async () => {
    setError('');
    if (!candidateForm.name.trim()) { setError(zh ? '請填寫應徵者姓名' : 'Enter candidate name'); return; }
    setSaving(true);
    await supabase.from('candidates').insert({
      org_id: orgId,
      job_id: candidateForm.job_id || null,
      name: candidateForm.name,
      email: candidateForm.email || null,
      phone: candidateForm.phone || null,
      stage: candidateForm.stage,
      source: candidateForm.source || null,
      notes: candidateForm.notes || null,
      rating: candidateForm.rating ? parseInt(candidateForm.rating) : null,
    });
    setSaving(false);
    setShowCreateCandidate(false);
    setCandidateForm({ name: '', email: '', phone: '', job_id: '', stage: 'applied', source: '', notes: '', rating: '' });
    loadCandidates();
  };

  const updateCandidateStage = async (candidate: Candidate, stage: string) => {
    await supabase.from('candidates').update({ stage }).eq('id', candidate.id);
    loadCandidates();
    if (selectedCandidate?.id === candidate.id) setSelectedCandidate({ ...candidate, stage });
  };

  const saveInterview = async () => {
    setError('');
    if (!interviewForm.candidate_id) { setError(zh ? '請選擇應徵者' : 'Select a candidate'); return; }
    setSaving(true);
    await supabase.from('interviews').insert({
      org_id: orgId,
      candidate_id: interviewForm.candidate_id,
      interviewer_id: interviewForm.interviewer_id || null,
      scheduled_at: interviewForm.scheduled_at || null,
      interview_type: interviewForm.interview_type,
      status: 'scheduled',
      feedback: interviewForm.feedback || null,
      score: interviewForm.score ? parseInt(interviewForm.score) : null,
    });
    setSaving(false);
    setShowCreateInterview(false);
    setInterviewForm({ candidate_id: '', interviewer_id: '', scheduled_at: '', interview_type: 'onsite', feedback: '', score: '' });
    loadInterviews();
  };

  const updateInterviewStatus = async (id: string, status: string) => {
    await supabase.from('interviews').update({ status }).eq('id', id);
    loadInterviews();
  };

  return (
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 700, margin: 0 }}>🔍 {zh ? '招募管理' : 'Recruitment'}</h1>
        <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--text-muted)' }}>
          {zh ? '職缺管理、應徵者追蹤與面試安排' : 'Job postings, candidate pipeline and interview scheduling'}
        </p>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '12px', marginBottom: '20px' }}>
        {[
          { label: zh ? '開放職缺' : 'Open Jobs',       value: openJobs,           color: '#16a34a' },
          { label: zh ? '本月新增應徵' : 'New Candidates', value: newCandidates,    color: '#6366f1' },
          { label: zh ? '待面試' : 'Upcoming Interviews', value: upcomingInterviews, color: '#f59e0b' },
          { label: zh ? '錄取通知' : 'Offers',            value: offers,             color: '#2563eb' },
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
          { key: 'jobs',       label: `💼 ${zh ? '職缺管理' : 'Jobs'} (${jobs.length})` },
          { key: 'candidates', label: `👥 ${zh ? '應徵者' : 'Candidates'} (${candidates.length})` },
          { key: 'interviews', label: `📅 ${zh ? '面試安排' : 'Interviews'} (${interviews.length})` },
        ] as const).map(({ key, label }) => (
          <button key={key} className={`tab-item ${tab === key ? 'active' : ''}`} onClick={() => setTab(key)}>{label}</button>
        ))}
      </div>

      {/* ── Tab: Jobs ── */}
      {tab === 'jobs' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '12px' }}>
            <button className="btn btn-primary btn-sm" onClick={() => setShowCreateJob(true)}>+ {zh ? '新增職缺' : 'New Job'}</button>
          </div>
          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>{zh ? '載入中...' : 'Loading...'}</div>
          ) : jobs.length === 0 ? (
            <div className="card" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
              {zh ? '尚無職缺' : 'No job postings yet'}
            </div>
          ) : (
            <div style={{ display: 'flex', gap: '16px' }}>
              <div style={{ flex: '1 1 0', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {jobs.map(job => (
                  <div key={job.id} className="card" style={{ padding: '14px', cursor: 'pointer', borderColor: selectedJob?.id === job.id ? 'var(--accent-blue)' : undefined }} onClick={() => setSelectedJob(job)}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '14px' }}>{job.title}</div>
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                          {[job.department, job.location, job.job_type].filter(Boolean).join(' · ')}
                        </div>
                        {(job.salary_min || job.salary_max) && (
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                            💰 {job.salary_min?.toLocaleString() ?? '—'} – {job.salary_max?.toLocaleString() ?? '—'} NTD
                          </div>
                        )}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                        <JobStatusBadge status={job.status} zh={zh} />
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                          👥 {candidates.filter(c => c.job_id === job.id).length} / {job.headcount}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Job detail */}
              {selectedJob && (
                <div style={{ flex: '0 0 340px', position: 'sticky', top: '20px', alignSelf: 'flex-start' }}>
                  <div className="card" style={{ padding: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                      <h3 style={{ margin: 0, fontSize: '15px' }}>{selectedJob.title}</h3>
                      <button style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', color: 'var(--text-muted)' }} onClick={() => setSelectedJob(null)}>×</button>
                    </div>
                    <div style={{ fontSize: '13px', display: 'grid', gap: '6px', marginBottom: '12px' }}>
                      {selectedJob.department && <div><span className="detail-label">{zh ? '部門' : 'Dept'}</span> {selectedJob.department}</div>}
                      {selectedJob.location && <div><span className="detail-label">{zh ? '地點' : 'Location'}</span> {selectedJob.location}</div>}
                      <div><span className="detail-label">{zh ? '名額' : 'Headcount'}</span> {selectedJob.headcount}</div>
                      {selectedJob.closes_at && <div><span className="detail-label">{zh ? '截止' : 'Closes'}</span> {selectedJob.closes_at}</div>}
                    </div>
                    {selectedJob.description && (
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '12px', whiteSpace: 'pre-wrap' }}>{selectedJob.description}</div>
                    )}
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      {selectedJob.status === 'draft' && (
                        <button className="btn btn-primary btn-sm" onClick={() => updateJobStatus(selectedJob, 'open')}>
                          🟢 {zh ? '發布' : 'Publish'}
                        </button>
                      )}
                      {selectedJob.status === 'open' && (
                        <>
                          <button className="btn btn-secondary btn-sm" onClick={() => updateJobStatus(selectedJob, 'filled')}>✓ {zh ? '已錄用' : 'Mark Filled'}</button>
                          <button className="btn btn-secondary btn-sm" onClick={() => updateJobStatus(selectedJob, 'closed')}>✕ {zh ? '關閉' : 'Close'}</button>
                        </>
                      )}
                      <button className="btn btn-secondary btn-sm" onClick={() => { setCandidateForm(f => ({ ...f, job_id: selectedJob.id })); setShowCreateCandidate(true); setTab('candidates'); }}>
                        + {zh ? '新增應徵者' : 'Add Candidate'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ── Tab: Candidates ── */}
      {tab === 'candidates' && (
        <>
          <div style={{ display: 'flex', gap: '10px', marginBottom: '12px', flexWrap: 'wrap' }}>
            <select className="input-field" style={{ flex: '1 1 180px' }} value={filterJob} onChange={e => setFilterJob(e.target.value)}>
              <option value="">{zh ? '所有職缺' : 'All Jobs'}</option>
              {jobs.map(j => <option key={j.id} value={j.id}>{j.title}</option>)}
            </select>
            <select className="input-field" style={{ flex: '0 0 130px' }} value={filterStage} onChange={e => setFilterStage(e.target.value)}>
              <option value="">{zh ? '所有階段' : 'All Stages'}</option>
              {STAGES.map(s => <option key={s.key} value={s.key}>{zh ? s.label : s.labelEn}</option>)}
            </select>
            <button className="btn btn-primary btn-sm" onClick={() => setShowCreateCandidate(true)}>
              + {zh ? '新增應徵者' : 'Add Candidate'}
            </button>
          </div>

          {/* Stage pipeline summary */}
          <div style={{ display: 'flex', gap: '6px', marginBottom: '14px', flexWrap: 'wrap' }}>
            {STAGES.map(s => {
              const count = candidates.filter(c => c.stage === s.key).length;
              return (
                <button
                  key={s.key}
                  onClick={() => setFilterStage(filterStage === s.key ? '' : s.key)}
                  style={{ background: filterStage === s.key ? s.bg : 'var(--surface-2)', color: filterStage === s.key ? s.color : 'var(--text-muted)', border: `1px solid ${filterStage === s.key ? s.color : 'transparent'}`, borderRadius: '8px', padding: '4px 10px', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}
                >
                  {zh ? s.label : s.labelEn} ({count})
                </button>
              );
            })}
          </div>

          <div style={{ display: 'flex', gap: '16px' }}>
            <div style={{ flex: '1 1 0', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {candidates.length === 0 ? (
                <div className="card" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  {zh ? '尚無應徵者' : 'No candidates yet'}
                </div>
              ) : candidates.map(c => (
                <div key={c.id} className="card" style={{ padding: '14px', cursor: 'pointer', borderColor: selectedCandidate?.id === c.id ? 'var(--accent-blue)' : undefined }} onClick={() => setSelectedCandidate(c)}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '14px' }}>{c.name}</div>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                        {[c.email, c.phone].filter(Boolean).join(' · ')}
                      </div>
                      {c.job_id && (
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                          💼 {jobs.find(j => j.id === c.job_id)?.title ?? '—'}
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                      <StageBadge stage={c.stage} zh={zh} />
                      <RatingStars rating={c.rating} />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Candidate detail */}
            {selectedCandidate && (
              <div style={{ flex: '0 0 340px', position: 'sticky', top: '20px', alignSelf: 'flex-start' }}>
                <div className="card" style={{ padding: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                    <h3 style={{ margin: 0, fontSize: '15px' }}>{selectedCandidate.name}</h3>
                    <button style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', color: 'var(--text-muted)' }} onClick={() => setSelectedCandidate(null)}>×</button>
                  </div>
                  <div style={{ fontSize: '13px', display: 'grid', gap: '4px', marginBottom: '12px' }}>
                    {selectedCandidate.email && <div>📧 {selectedCandidate.email}</div>}
                    {selectedCandidate.phone && <div>📞 {selectedCandidate.phone}</div>}
                    {selectedCandidate.source && <div>🔗 {selectedCandidate.source}</div>}
                    {selectedCandidate.assigned_to && <div>👤 {empName(selectedCandidate.assigned_to)}</div>}
                  </div>
                  {selectedCandidate.notes && (
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '12px', whiteSpace: 'pre-wrap' }}>{selectedCandidate.notes}</div>
                  )}
                  <div style={{ marginBottom: '12px' }}>
                    <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>{zh ? '推進至' : 'Move to stage'}</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                      {STAGES.map(s => (
                        <button
                          key={s.key}
                          onClick={() => updateCandidateStage(selectedCandidate, s.key)}
                          style={{ background: selectedCandidate.stage === s.key ? s.bg : 'var(--surface-2)', color: selectedCandidate.stage === s.key ? s.color : 'var(--text-muted)', border: `1px solid ${selectedCandidate.stage === s.key ? s.color : 'transparent'}`, borderRadius: '6px', padding: '3px 8px', fontSize: '11px', cursor: 'pointer', fontWeight: selectedCandidate.stage === s.key ? 600 : 400 }}
                        >
                          {zh ? s.label : s.labelEn}
                        </button>
                      ))}
                    </div>
                  </div>
                  <button className="btn btn-secondary btn-sm" style={{ width: '100%' }} onClick={() => { setInterviewForm(f => ({ ...f, candidate_id: selectedCandidate.id })); setShowCreateInterview(true); setTab('interviews'); }}>
                    📅 {zh ? '安排面試' : 'Schedule Interview'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* ── Tab: Interviews ── */}
      {tab === 'interviews' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '12px' }}>
            <button className="btn btn-primary btn-sm" onClick={() => setShowCreateInterview(true)}>+ {zh ? '安排面試' : 'Schedule Interview'}</button>
          </div>
          {interviews.length === 0 ? (
            <div className="card" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
              {zh ? '尚無面試記錄' : 'No interviews scheduled yet'}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {interviews.map(iv => {
                const cand = candidates.find(c => c.id === iv.candidate_id);
                const statusColor = iv.status === 'completed' ? '#16a34a' : iv.status === 'cancelled' ? '#b91c1c' : '#f59e0b';
                return (
                  <div key={iv.id} className="card" style={{ padding: '14px', borderLeft: `4px solid ${statusColor}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '14px' }}>{cand?.name ?? iv.candidate_id.slice(0, 8)}</div>
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                          {iv.interview_type && <span>{INTERVIEW_TYPES.find(t => t.key === iv.interview_type)?.[zh ? 'label' : 'labelEn'] ?? iv.interview_type}</span>}
                          {iv.scheduled_at && <span> · {new Date(iv.scheduled_at).toLocaleString('zh-TW', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>}
                          {iv.interviewer_id && <span> · 👤 {empName(iv.interviewer_id)}</span>}
                        </div>
                        {iv.feedback && <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>{iv.feedback}</div>}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                        <span style={{ fontSize: '11px', color: statusColor, fontWeight: 600 }}>{iv.status}</span>
                        {iv.score && <span>{[1,2,3,4,5].map(i => <span key={i} style={{ color: i <= iv.score! ? '#f59e0b' : '#d1d5db', fontSize: '12px' }}>★</span>)}</span>}
                        {iv.status === 'scheduled' && (
                          <button className="btn btn-secondary btn-sm" onClick={() => updateInterviewStatus(iv.id, 'completed')}>
                            ✓ {zh ? '完成' : 'Done'}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ── Modal: Create Job ── */}
      {showCreateJob && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
          onClick={e => { if (e.target === e.currentTarget) setShowCreateJob(false); }}>
          <div className="card" style={{ padding: '24px', width: '100%', maxWidth: '560px', maxHeight: '90vh', overflowY: 'auto' }}>
            <h2 style={{ fontSize: '16px', fontWeight: 600, margin: '0 0 16px' }}>{zh ? '新增職缺' : 'New Job Posting'}</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <label className="detail-label">{zh ? '職缺名稱 *' : 'Job Title *'}</label>
                <input className="input-field" value={jobForm.title} onChange={e => setJobForm(f => ({ ...f, title: e.target.value }))} />
              </div>
              <div>
                <label className="detail-label">{zh ? '部門' : 'Department'}</label>
                <input className="input-field" value={jobForm.department} onChange={e => setJobForm(f => ({ ...f, department: e.target.value }))} />
              </div>
              <div>
                <label className="detail-label">{zh ? '工作地點' : 'Location'}</label>
                <input className="input-field" value={jobForm.location} onChange={e => setJobForm(f => ({ ...f, location: e.target.value }))} />
              </div>
              <div>
                <label className="detail-label">{zh ? '類型' : 'Type'}</label>
                <select className="input-field" value={jobForm.job_type} onChange={e => setJobForm(f => ({ ...f, job_type: e.target.value }))}>
                  {[['full-time','全職','Full-time'],['part-time','兼職','Part-time'],['contract','合約','Contract'],['internship','實習','Internship']].map(([v,z,e]) => (
                    <option key={v} value={v}>{zh ? z : e}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="detail-label">{zh ? '狀態' : 'Status'}</label>
                <select className="input-field" value={jobForm.status} onChange={e => setJobForm(f => ({ ...f, status: e.target.value }))}>
                  <option value="draft">{zh ? '草稿' : 'Draft'}</option>
                  <option value="open">{zh ? '招募中' : 'Open'}</option>
                </select>
              </div>
              <div>
                <label className="detail-label">{zh ? '最低薪資 (NTD)' : 'Min Salary (NTD)'}</label>
                <input type="number" className="input-field" value={jobForm.salary_min} onChange={e => setJobForm(f => ({ ...f, salary_min: e.target.value }))} />
              </div>
              <div>
                <label className="detail-label">{zh ? '最高薪資 (NTD)' : 'Max Salary (NTD)'}</label>
                <input type="number" className="input-field" value={jobForm.salary_max} onChange={e => setJobForm(f => ({ ...f, salary_max: e.target.value }))} />
              </div>
              <div>
                <label className="detail-label">{zh ? '名額' : 'Headcount'}</label>
                <input type="number" min="1" className="input-field" value={jobForm.headcount} onChange={e => setJobForm(f => ({ ...f, headcount: e.target.value }))} />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label className="detail-label">{zh ? '職缺說明' : 'Description'}</label>
                <textarea className="input-field" rows={3} value={jobForm.description} onChange={e => setJobForm(f => ({ ...f, description: e.target.value }))} />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label className="detail-label">{zh ? '應徵條件' : 'Requirements'}</label>
                <textarea className="input-field" rows={3} value={jobForm.requirements} onChange={e => setJobForm(f => ({ ...f, requirements: e.target.value }))} />
              </div>
            </div>
            {error && <div style={{ color: '#dc2626', fontSize: '13px', marginTop: '8px' }}>{error}</div>}
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '16px' }}>
              <button className="btn btn-secondary" onClick={() => setShowCreateJob(false)}>{zh ? '取消' : 'Cancel'}</button>
              <button className="btn btn-primary" onClick={saveJob} disabled={saving}>{saving ? '...' : (zh ? '儲存' : 'Save')}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Create Candidate ── */}
      {showCreateCandidate && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
          onClick={e => { if (e.target === e.currentTarget) setShowCreateCandidate(false); }}>
          <div className="card" style={{ padding: '24px', width: '100%', maxWidth: '480px' }}>
            <h2 style={{ fontSize: '16px', fontWeight: 600, margin: '0 0 16px' }}>{zh ? '新增應徵者' : 'Add Candidate'}</h2>
            <div style={{ display: 'grid', gap: '12px' }}>
              <div>
                <label className="detail-label">{zh ? '姓名 *' : 'Name *'}</label>
                <input className="input-field" value={candidateForm.name} onChange={e => setCandidateForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label className="detail-label">Email</label>
                  <input type="email" className="input-field" value={candidateForm.email} onChange={e => setCandidateForm(f => ({ ...f, email: e.target.value }))} />
                </div>
                <div>
                  <label className="detail-label">{zh ? '電話' : 'Phone'}</label>
                  <input className="input-field" value={candidateForm.phone} onChange={e => setCandidateForm(f => ({ ...f, phone: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="detail-label">{zh ? '應徵職缺' : 'Job'}</label>
                <select className="input-field" value={candidateForm.job_id} onChange={e => setCandidateForm(f => ({ ...f, job_id: e.target.value }))}>
                  <option value="">{zh ? '選填' : 'Optional'}</option>
                  {jobs.map(j => <option key={j.id} value={j.id}>{j.title}</option>)}
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label className="detail-label">{zh ? '階段' : 'Stage'}</label>
                  <select className="input-field" value={candidateForm.stage} onChange={e => setCandidateForm(f => ({ ...f, stage: e.target.value }))}>
                    {STAGES.map(s => <option key={s.key} value={s.key}>{zh ? s.label : s.labelEn}</option>)}
                  </select>
                </div>
                <div>
                  <label className="detail-label">{zh ? '來源' : 'Source'}</label>
                  <select className="input-field" value={candidateForm.source} onChange={e => setCandidateForm(f => ({ ...f, source: e.target.value }))}>
                    <option value="">{zh ? '選填' : 'Optional'}</option>
                    {[['referral','員工推薦'],['linkedin','LinkedIn'],['website','官網'],['agency','人力銀行'],['other','其他']].map(([v, l]) => (
                      <option key={v} value={v}>{zh ? l : v}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="detail-label">{zh ? '評分 (1–5)' : 'Rating (1–5)'}</label>
                <select className="input-field" value={candidateForm.rating} onChange={e => setCandidateForm(f => ({ ...f, rating: e.target.value }))}>
                  <option value="">{zh ? '尚未評分' : 'Not rated'}</option>
                  {[1,2,3,4,5].map(n => <option key={n} value={n}>{n} ★</option>)}
                </select>
              </div>
              <div>
                <label className="detail-label">{zh ? '備註' : 'Notes'}</label>
                <textarea className="input-field" rows={2} value={candidateForm.notes} onChange={e => setCandidateForm(f => ({ ...f, notes: e.target.value }))} />
              </div>
            </div>
            {error && <div style={{ color: '#dc2626', fontSize: '13px', marginTop: '8px' }}>{error}</div>}
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '16px' }}>
              <button className="btn btn-secondary" onClick={() => setShowCreateCandidate(false)}>{zh ? '取消' : 'Cancel'}</button>
              <button className="btn btn-primary" onClick={saveCandidate} disabled={saving}>{saving ? '...' : (zh ? '儲存' : 'Save')}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Schedule Interview ── */}
      {showCreateInterview && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
          onClick={e => { if (e.target === e.currentTarget) setShowCreateInterview(false); }}>
          <div className="card" style={{ padding: '24px', width: '100%', maxWidth: '480px' }}>
            <h2 style={{ fontSize: '16px', fontWeight: 600, margin: '0 0 16px' }}>{zh ? '安排面試' : 'Schedule Interview'}</h2>
            <div style={{ display: 'grid', gap: '12px' }}>
              <div>
                <label className="detail-label">{zh ? '應徵者 *' : 'Candidate *'}</label>
                <select className="input-field" value={interviewForm.candidate_id} onChange={e => setInterviewForm(f => ({ ...f, candidate_id: e.target.value }))}>
                  <option value="">{zh ? '選擇應徵者' : 'Select candidate'}</option>
                  {candidates.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="detail-label">{zh ? '面試官' : 'Interviewer'}</label>
                <select className="input-field" value={interviewForm.interviewer_id} onChange={e => setInterviewForm(f => ({ ...f, interviewer_id: e.target.value }))}>
                  <option value="">{zh ? '選填' : 'Optional'}</option>
                  {employees.map(e => <option key={e.id} value={e.id}>{e.display_name || e.line_display_name}</option>)}
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label className="detail-label">{zh ? '面試時間' : 'Scheduled At'}</label>
                  <input type="datetime-local" className="input-field" value={interviewForm.scheduled_at} onChange={e => setInterviewForm(f => ({ ...f, scheduled_at: e.target.value }))} />
                </div>
                <div>
                  <label className="detail-label">{zh ? '面試類型' : 'Type'}</label>
                  <select className="input-field" value={interviewForm.interview_type} onChange={e => setInterviewForm(f => ({ ...f, interview_type: e.target.value }))}>
                    {INTERVIEW_TYPES.map(t => <option key={t.key} value={t.key}>{zh ? t.label : t.labelEn}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="detail-label">{zh ? '評分 (1–5)' : 'Score (1–5)'}</label>
                <select className="input-field" value={interviewForm.score} onChange={e => setInterviewForm(f => ({ ...f, score: e.target.value }))}>
                  <option value="">{zh ? '面試後填寫' : 'Fill after interview'}</option>
                  {[1,2,3,4,5].map(n => <option key={n} value={n}>{n} ★</option>)}
                </select>
              </div>
              <div>
                <label className="detail-label">{zh ? '面試回饋' : 'Feedback'}</label>
                <textarea className="input-field" rows={3} value={interviewForm.feedback} onChange={e => setInterviewForm(f => ({ ...f, feedback: e.target.value }))} placeholder={zh ? '面試後填寫' : 'Fill after interview'} />
              </div>
            </div>
            {error && <div style={{ color: '#dc2626', fontSize: '13px', marginTop: '8px' }}>{error}</div>}
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '16px' }}>
              <button className="btn btn-secondary" onClick={() => setShowCreateInterview(false)}>{zh ? '取消' : 'Cancel'}</button>
              <button className="btn btn-primary" onClick={saveInterview} disabled={saving}>{saving ? '...' : (zh ? '儲存' : 'Save')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
