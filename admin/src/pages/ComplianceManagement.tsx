import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { getLocale } from '../lib/i18n';
import { useOrg } from '../lib/OrgContext';

// ── Interfaces ────────────────────────────────────────────────────────────────
interface JobTitle {
  id: string; org_id: string; title_zh: string; title_en: string | null;
  department_id: string | null; level: string | null; description: string | null;
  is_active: boolean; sort_order: number;
}
interface JobGrade {
  id: string; org_id: string; grade_code: string; grade_name_zh: string;
  grade_name_en: string | null; min_salary: number | null; max_salary: number | null;
  description: string | null; sort_order: number;
}
interface WorkRule {
  id: string; org_id: string; rule_category: string; title: string;
  content: string | null; effective_date: string | null; version: string | null;
  is_active: boolean; created_by: string | null;
}
interface LaborMeeting {
  id: string; org_id: string; meeting_date: string; meeting_number: string | null;
  attendees: string | null; agenda: string | null; resolutions: string | null;
  notes: string | null; minutes_file_url: string | null; created_by: string | null;
}
interface HarassmentPolicy {
  id: string; org_id: string; policy_version: string | null; effective_date: string | null;
  content: string | null; responsible_person: string | null; complaint_channel: string | null;
}
interface HarassmentComplaint {
  id: string; org_id: string; complaint_date: string; is_anonymous: boolean;
  complainant_name: string | null; respondent_name: string | null;
  description: string | null; status: string; resolution: string | null;
  investigator: string | null; resolved_date: string | null;
}
interface CostCenter {
  id: string; org_id: string; center_code: string; name_zh: string;
  name_en: string | null; parent_id: string | null; manager_id: string | null;
  budget_amount: number | null; is_active: boolean;
}

type TabKey = 'titles' | 'grades' | 'rules' | 'meetings' | 'harassment' | 'costcenters';

const RULE_CATEGORIES = ['出勤', '請假', '獎懲', '安全', '其他'];
const COMPLAINT_STATUSES: Record<string, { zh: string; en: string; bg: string; color: string }> = {
  received:      { zh: '已受理', en: 'Received',      bg: '#dbeafe', color: '#1d4ed8' },
  investigating: { zh: '調查中', en: 'Investigating', bg: '#fef3c7', color: '#b45309' },
  resolved:      { zh: '已解決', en: 'Resolved',      bg: '#dcfce7', color: '#15803d' },
  closed:        { zh: '已結案', en: 'Closed',        bg: '#f3f4f6', color: '#374151' },
};

const inputStyle = { width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: '13px' };
const labelStyle = { fontSize: '12px', fontWeight: 600 as const, color: 'var(--text-secondary)', marginBottom: '4px', display: 'block' };
const modalOverlay: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 };
const modalBox: React.CSSProperties = { width: '560px', maxHeight: '80vh', overflow: 'auto', padding: '24px' };

export function ComplianceManagement() {
  const zh = getLocale() === 'zh-TW';
  const { orgId, currentUser } = useOrg();
  const [tab, setTab] = useState<TabKey>('titles');
  const [saving, setSaving] = useState(false);

  // ── Tab 1: Job Titles ───────────────────────────────────────────────────────
  const [titles, setTitles] = useState<JobTitle[]>([]);
  const [titlesLoading, setTitlesLoading] = useState(true);
  const [showTitleForm, setShowTitleForm] = useState(false);
  const [editingTitle, setEditingTitle] = useState<JobTitle | null>(null);
  const [titleForm, setTitleForm] = useState({ title_zh: '', title_en: '', department_id: '', level: '', description: '', is_active: true, sort_order: 0 });

  async function loadTitles() {
    if (!orgId) return;
    setTitlesLoading(true);
    const { data } = await supabase.from('job_titles').select('*').eq('org_id', orgId).order('sort_order');
    setTitles(data || []);
    setTitlesLoading(false);
  }
  function openTitleForm(t?: JobTitle) {
    if (t) {
      setEditingTitle(t);
      setTitleForm({ title_zh: t.title_zh, title_en: t.title_en || '', department_id: t.department_id || '', level: t.level || '', description: t.description || '', is_active: t.is_active, sort_order: t.sort_order });
    } else {
      setEditingTitle(null);
      setTitleForm({ title_zh: '', title_en: '', department_id: '', level: '', description: '', is_active: true, sort_order: 0 });
    }
    setShowTitleForm(true);
  }
  async function saveTitle() {
    if (!titleForm.title_zh.trim()) return;
    setSaving(true);
    const payload = { org_id: orgId, title_zh: titleForm.title_zh.trim(), title_en: titleForm.title_en.trim() || null, department_id: titleForm.department_id || null, level: titleForm.level || null, description: titleForm.description.trim() || null, is_active: titleForm.is_active, sort_order: titleForm.sort_order };
    if (editingTitle) {
      await supabase.from('job_titles').update(payload).eq('id', editingTitle.id);
    } else {
      await supabase.from('job_titles').insert(payload);
    }
    setSaving(false);
    setShowTitleForm(false);
    loadTitles();
  }
  async function deleteTitle(id: string) {
    if (!confirm(zh ? '確定刪除此職稱？' : 'Delete this job title?')) return;
    await supabase.from('job_titles').delete().eq('id', id);
    loadTitles();
  }

  // ── Tab 2: Job Grades ───────────────────────────────────────────────────────
  const [grades, setGrades] = useState<JobGrade[]>([]);
  const [gradesLoading, setGradesLoading] = useState(true);
  const [showGradeForm, setShowGradeForm] = useState(false);
  const [editingGrade, setEditingGrade] = useState<JobGrade | null>(null);
  const [gradeForm, setGradeForm] = useState({ grade_code: '', grade_name_zh: '', grade_name_en: '', min_salary: 0, max_salary: 0, description: '', sort_order: 0 });

  async function loadGrades() {
    if (!orgId) return;
    setGradesLoading(true);
    const { data } = await supabase.from('job_grades').select('*').eq('org_id', orgId).order('sort_order');
    setGrades(data || []);
    setGradesLoading(false);
  }
  function openGradeForm(g?: JobGrade) {
    if (g) {
      setEditingGrade(g);
      setGradeForm({ grade_code: g.grade_code, grade_name_zh: g.grade_name_zh, grade_name_en: g.grade_name_en || '', min_salary: g.min_salary || 0, max_salary: g.max_salary || 0, description: g.description || '', sort_order: g.sort_order });
    } else {
      setEditingGrade(null);
      setGradeForm({ grade_code: '', grade_name_zh: '', grade_name_en: '', min_salary: 0, max_salary: 0, description: '', sort_order: 0 });
    }
    setShowGradeForm(true);
  }
  async function saveGrade() {
    if (!gradeForm.grade_code.trim() || !gradeForm.grade_name_zh.trim()) return;
    setSaving(true);
    const payload = { org_id: orgId, grade_code: gradeForm.grade_code.trim(), grade_name_zh: gradeForm.grade_name_zh.trim(), grade_name_en: gradeForm.grade_name_en.trim() || null, min_salary: gradeForm.min_salary || null, max_salary: gradeForm.max_salary || null, description: gradeForm.description.trim() || null, sort_order: gradeForm.sort_order };
    if (editingGrade) {
      await supabase.from('job_grades').update(payload).eq('id', editingGrade.id);
    } else {
      await supabase.from('job_grades').insert(payload);
    }
    setSaving(false);
    setShowGradeForm(false);
    loadGrades();
  }
  async function deleteGrade(id: string) {
    if (!confirm(zh ? '確定刪除此職等？' : 'Delete this job grade?')) return;
    await supabase.from('job_grades').delete().eq('id', id);
    loadGrades();
  }

  // ── Tab 3: Work Rules ──────────────────────────────────────────────────────
  const [rules, setRules] = useState<WorkRule[]>([]);
  const [rulesLoading, setRulesLoading] = useState(true);
  const [showRuleForm, setShowRuleForm] = useState(false);
  const [editingRule, setEditingRule] = useState<WorkRule | null>(null);
  const [ruleForm, setRuleForm] = useState({ rule_category: '出勤', title: '', content: '', effective_date: '', version: '', is_active: true });
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);

  async function loadRules() {
    if (!orgId) return;
    setRulesLoading(true);
    const { data } = await supabase.from('work_rules').select('*').eq('org_id', orgId).order('rule_category').order('title');
    setRules(data || []);
    setRulesLoading(false);
  }
  function openRuleForm(r?: WorkRule) {
    if (r) {
      setEditingRule(r);
      setRuleForm({ rule_category: r.rule_category, title: r.title, content: r.content || '', effective_date: r.effective_date || '', version: r.version || '', is_active: r.is_active });
    } else {
      setEditingRule(null);
      setRuleForm({ rule_category: '出勤', title: '', content: '', effective_date: '', version: '', is_active: true });
    }
    setShowRuleForm(true);
  }
  async function saveRule() {
    if (!ruleForm.title.trim()) return;
    setSaving(true);
    const payload = { org_id: orgId, rule_category: ruleForm.rule_category, title: ruleForm.title.trim(), content: ruleForm.content.trim() || null, effective_date: ruleForm.effective_date || null, version: ruleForm.version.trim() || null, is_active: ruleForm.is_active, created_by: currentUser?.id || null };
    if (editingRule) {
      await supabase.from('work_rules').update(payload).eq('id', editingRule.id);
    } else {
      await supabase.from('work_rules').insert(payload);
    }
    setSaving(false);
    setShowRuleForm(false);
    loadRules();
  }
  async function deleteRule(id: string) {
    if (!confirm(zh ? '確定刪除此規則？' : 'Delete this work rule?')) return;
    await supabase.from('work_rules').delete().eq('id', id);
    loadRules();
  }

  // ── Tab 4: Labor Meetings ──────────────────────────────────────────────────
  const [meetings, setMeetings] = useState<LaborMeeting[]>([]);
  const [meetingsLoading, setMeetingsLoading] = useState(true);
  const [showMeetingForm, setShowMeetingForm] = useState(false);
  const [editingMeeting, setEditingMeeting] = useState<LaborMeeting | null>(null);
  const [meetingForm, setMeetingForm] = useState({ meeting_date: '', meeting_number: '', attendees: '', agenda: '', resolutions: '', notes: '', minutes_file_url: '' });

  async function loadMeetings() {
    if (!orgId) return;
    setMeetingsLoading(true);
    const { data } = await supabase.from('labor_meetings').select('*').eq('org_id', orgId).order('meeting_date', { ascending: false });
    setMeetings(data || []);
    setMeetingsLoading(false);
  }
  function openMeetingForm(m?: LaborMeeting) {
    if (m) {
      setEditingMeeting(m);
      setMeetingForm({ meeting_date: m.meeting_date || '', meeting_number: m.meeting_number || '', attendees: m.attendees || '', agenda: m.agenda || '', resolutions: m.resolutions || '', notes: m.notes || '', minutes_file_url: m.minutes_file_url || '' });
    } else {
      setEditingMeeting(null);
      setMeetingForm({ meeting_date: '', meeting_number: '', attendees: '', agenda: '', resolutions: '', notes: '', minutes_file_url: '' });
    }
    setShowMeetingForm(true);
  }
  async function saveMeeting() {
    if (!meetingForm.meeting_date) return;
    setSaving(true);
    const payload = { org_id: orgId, meeting_date: meetingForm.meeting_date, meeting_number: meetingForm.meeting_number.trim() || null, attendees: meetingForm.attendees.trim() || null, agenda: meetingForm.agenda.trim() || null, resolutions: meetingForm.resolutions.trim() || null, notes: meetingForm.notes.trim() || null, minutes_file_url: meetingForm.minutes_file_url.trim() || null, created_by: currentUser?.id || null };
    if (editingMeeting) {
      await supabase.from('labor_meetings').update(payload).eq('id', editingMeeting.id);
    } else {
      await supabase.from('labor_meetings').insert(payload);
    }
    setSaving(false);
    setShowMeetingForm(false);
    loadMeetings();
  }
  async function deleteMeeting(id: string) {
    if (!confirm(zh ? '確定刪除此會議紀錄？' : 'Delete this meeting record?')) return;
    await supabase.from('labor_meetings').delete().eq('id', id);
    loadMeetings();
  }

  // ── Tab 5: Harassment Prevention ───────────────────────────────────────────
  const [policies, setPolicies] = useState<HarassmentPolicy[]>([]);
  const [complaints, setComplaints] = useState<HarassmentComplaint[]>([]);
  const [harassLoading, setHarassLoading] = useState(true);
  const [harassSubTab, setHarassSubTab] = useState<'policy' | 'complaints'>('policy');
  const [showPolicyForm, setShowPolicyForm] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState<HarassmentPolicy | null>(null);
  const [policyForm, setPolicyForm] = useState({ policy_version: '', effective_date: '', content: '', responsible_person: '', complaint_channel: '' });
  const [showComplaintForm, setShowComplaintForm] = useState(false);
  const [editingComplaint, setEditingComplaint] = useState<HarassmentComplaint | null>(null);
  const [complaintForm, setComplaintForm] = useState({ complaint_date: '', is_anonymous: false, complainant_name: '', respondent_name: '', description: '', status: 'received', resolution: '', investigator: '', resolved_date: '' });

  async function loadHarassment() {
    if (!orgId) return;
    setHarassLoading(true);
    const [pRes, cRes] = await Promise.all([
      supabase.from('harassment_policy').select('*').eq('org_id', orgId).order('effective_date', { ascending: false }),
      supabase.from('harassment_complaints').select('*').eq('org_id', orgId).order('complaint_date', { ascending: false }),
    ]);
    setPolicies(pRes.data || []);
    setComplaints(cRes.data || []);
    setHarassLoading(false);
  }
  function openPolicyForm(p?: HarassmentPolicy) {
    if (p) {
      setEditingPolicy(p);
      setPolicyForm({ policy_version: p.policy_version || '', effective_date: p.effective_date || '', content: p.content || '', responsible_person: p.responsible_person || '', complaint_channel: p.complaint_channel || '' });
    } else {
      setEditingPolicy(null);
      setPolicyForm({ policy_version: '', effective_date: '', content: '', responsible_person: '', complaint_channel: '' });
    }
    setShowPolicyForm(true);
  }
  async function savePolicy() {
    if (!policyForm.policy_version.trim()) return;
    setSaving(true);
    const payload = { org_id: orgId, policy_version: policyForm.policy_version.trim(), effective_date: policyForm.effective_date || null, content: policyForm.content.trim() || null, responsible_person: policyForm.responsible_person.trim() || null, complaint_channel: policyForm.complaint_channel.trim() || null };
    if (editingPolicy) {
      await supabase.from('harassment_policy').update(payload).eq('id', editingPolicy.id);
    } else {
      await supabase.from('harassment_policy').insert(payload);
    }
    setSaving(false);
    setShowPolicyForm(false);
    loadHarassment();
  }
  async function deletePolicy(id: string) {
    if (!confirm(zh ? '確定刪除此政策？' : 'Delete this policy?')) return;
    await supabase.from('harassment_policy').delete().eq('id', id);
    loadHarassment();
  }
  function openComplaintForm(c?: HarassmentComplaint) {
    if (c) {
      setEditingComplaint(c);
      setComplaintForm({ complaint_date: c.complaint_date, is_anonymous: c.is_anonymous, complainant_name: c.complainant_name || '', respondent_name: c.respondent_name || '', description: c.description || '', status: c.status, resolution: c.resolution || '', investigator: c.investigator || '', resolved_date: c.resolved_date || '' });
    } else {
      setEditingComplaint(null);
      setComplaintForm({ complaint_date: '', is_anonymous: false, complainant_name: '', respondent_name: '', description: '', status: 'received', resolution: '', investigator: '', resolved_date: '' });
    }
    setShowComplaintForm(true);
  }
  async function saveComplaint() {
    if (!complaintForm.complaint_date) return;
    setSaving(true);
    const payload = { org_id: orgId, complaint_date: complaintForm.complaint_date, is_anonymous: complaintForm.is_anonymous, complainant_name: complaintForm.is_anonymous ? null : (complaintForm.complainant_name.trim() || null), respondent_name: complaintForm.respondent_name.trim() || null, description: complaintForm.description.trim() || null, status: complaintForm.status, resolution: complaintForm.resolution.trim() || null, investigator: complaintForm.investigator.trim() || null, resolved_date: complaintForm.resolved_date || null };
    if (editingComplaint) {
      await supabase.from('harassment_complaints').update(payload).eq('id', editingComplaint.id);
    } else {
      await supabase.from('harassment_complaints').insert(payload);
    }
    setSaving(false);
    setShowComplaintForm(false);
    loadHarassment();
  }
  async function deleteComplaint(id: string) {
    if (!confirm(zh ? '確定刪除此申訴紀錄？' : 'Delete this complaint?')) return;
    await supabase.from('harassment_complaints').delete().eq('id', id);
    loadHarassment();
  }

  // ── Tab 6: Cost Centers ────────────────────────────────────────────────────
  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
  const [ccLoading, setCcLoading] = useState(true);
  const [showCcForm, setShowCcForm] = useState(false);
  const [editingCc, setEditingCc] = useState<CostCenter | null>(null);
  const [ccForm, setCcForm] = useState({ center_code: '', name_zh: '', name_en: '', parent_id: '', manager_id: '', budget_amount: 0, is_active: true });

  async function loadCostCenters() {
    if (!orgId) return;
    setCcLoading(true);
    const { data } = await supabase.from('cost_centers').select('*').eq('org_id', orgId).order('center_code');
    setCostCenters(data || []);
    setCcLoading(false);
  }
  function openCcForm(c?: CostCenter) {
    if (c) {
      setEditingCc(c);
      setCcForm({ center_code: c.center_code, name_zh: c.name_zh, name_en: c.name_en || '', parent_id: c.parent_id || '', manager_id: c.manager_id || '', budget_amount: c.budget_amount || 0, is_active: c.is_active });
    } else {
      setEditingCc(null);
      setCcForm({ center_code: '', name_zh: '', name_en: '', parent_id: '', manager_id: '', budget_amount: 0, is_active: true });
    }
    setShowCcForm(true);
  }
  async function saveCostCenter() {
    if (!ccForm.center_code.trim() || !ccForm.name_zh.trim()) return;
    setSaving(true);
    const payload = { org_id: orgId, center_code: ccForm.center_code.trim(), name_zh: ccForm.name_zh.trim(), name_en: ccForm.name_en.trim() || null, parent_id: ccForm.parent_id || null, manager_id: ccForm.manager_id || null, budget_amount: ccForm.budget_amount || null, is_active: ccForm.is_active };
    if (editingCc) {
      await supabase.from('cost_centers').update(payload).eq('id', editingCc.id);
    } else {
      await supabase.from('cost_centers').insert(payload);
    }
    setSaving(false);
    setShowCcForm(false);
    loadCostCenters();
  }
  async function deleteCostCenter(id: string) {
    if (!confirm(zh ? '確定刪除此成本中心？' : 'Delete this cost center?')) return;
    await supabase.from('cost_centers').delete().eq('id', id);
    loadCostCenters();
  }

  // ── Build cost center tree ─────────────────────────────────────────────────
  function buildTree(items: CostCenter[], parentId: string | null = null, depth = 0): { item: CostCenter; depth: number }[] {
    const result: { item: CostCenter; depth: number }[] = [];
    items.filter(c => c.parent_id === parentId).forEach(c => {
      result.push({ item: c, depth });
      result.push(...buildTree(items, c.id, depth + 1));
    });
    return result;
  }

  // ── Load data on tab change ────────────────────────────────────────────────
  useEffect(() => {
    if (!orgId) return;
    if (tab === 'titles') loadTitles();
    else if (tab === 'grades') loadGrades();
    else if (tab === 'rules') loadRules();
    else if (tab === 'meetings') loadMeetings();
    else if (tab === 'harassment') loadHarassment();
    else if (tab === 'costcenters') loadCostCenters();
  }, [orgId, tab]);

  // ── Group rules by category ────────────────────────────────────────────────
  const rulesByCategory: Record<string, WorkRule[]> = {};
  rules.forEach(r => {
    if (!rulesByCategory[r.rule_category]) rulesByCategory[r.rule_category] = [];
    rulesByCategory[r.rule_category].push(r);
  });

  const TABS: { key: TabKey; zh: string; en: string; icon: string }[] = [
    { key: 'titles', zh: '職稱管理', en: 'Job Titles', icon: '🏷️' },
    { key: 'grades', zh: '職等管理', en: 'Job Grades', icon: '📊' },
    { key: 'rules', zh: '工作規則', en: 'Work Rules', icon: '📋' },
    { key: 'meetings', zh: '勞資會議', en: 'Labor Meetings', icon: '🤝' },
    { key: 'harassment', zh: '性騷擾防治', en: 'Harassment Prevention', icon: '🛡️' },
    { key: 'costcenters', zh: '成本中心', en: 'Cost Centers', icon: '💰' },
  ];

  const addBtnLabel = () => {
    const labels: Record<TabKey, { zh: string; en: string }> = {
      titles: { zh: '新增職稱', en: 'Add Title' },
      grades: { zh: '新增職等', en: 'Add Grade' },
      rules: { zh: '新增規則', en: 'Add Rule' },
      meetings: { zh: '新增會議', en: 'Add Meeting' },
      harassment: { zh: harassSubTab === 'policy' ? '新增政策' : '新增申訴', en: harassSubTab === 'policy' ? 'Add Policy' : 'Add Complaint' },
      costcenters: { zh: '新增成本中心', en: 'Add Cost Center' },
    };
    return labels[tab];
  };

  function handleAddClick() {
    if (tab === 'titles') openTitleForm();
    else if (tab === 'grades') openGradeForm();
    else if (tab === 'rules') openRuleForm();
    else if (tab === 'meetings') openMeetingForm();
    else if (tab === 'harassment') harassSubTab === 'policy' ? openPolicyForm() : openComplaintForm();
    else if (tab === 'costcenters') openCcForm();
  }

  return (
    <div className="fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: 700 }}>
          📑 {zh ? '組織合規管理' : 'Organization & Compliance'}
        </h2>
        <button className="btn btn-primary" onClick={handleAddClick}>
          + {zh ? addBtnLabel().zh : addBtnLabel().en}
        </button>
      </div>

      {/* Tab Bar */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '20px', flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button key={t.key} className={`btn ${tab === t.key ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTab(t.key)}>
            {t.icon} {zh ? t.zh : t.en}
          </button>
        ))}
      </div>

      {/* ════════════════════ Tab 1: Job Titles ════════════════════ */}
      {tab === 'titles' && (
        <div>
          {titlesLoading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>Loading...</div>
          ) : titles.length === 0 ? (
            <div className="card" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
              {zh ? '尚無職稱資料' : 'No job titles yet'}
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{zh ? '排序' : 'Order'}</th>
                    <th>{zh ? '中文名稱' : 'Title (ZH)'}</th>
                    <th>{zh ? '英文名稱' : 'Title (EN)'}</th>
                    <th>{zh ? '層級' : 'Level'}</th>
                    <th>{zh ? '說明' : 'Description'}</th>
                    <th>{zh ? '狀態' : 'Status'}</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {titles.map(t => (
                    <tr key={t.id} style={{ opacity: t.is_active ? 1 : 0.5 }}>
                      <td style={{ fontFamily: 'monospace', fontSize: '12px' }}>{t.sort_order}</td>
                      <td style={{ fontWeight: 500 }}>{t.title_zh}</td>
                      <td>{t.title_en || '—'}</td>
                      <td>{t.level || '—'}</td>
                      <td style={{ fontSize: '12px', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.description || '—'}</td>
                      <td>
                        <span style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '11px', background: t.is_active ? '#dcfce7' : '#fee2e2', color: t.is_active ? '#15803d' : '#b91c1c' }}>
                          {t.is_active ? (zh ? '啟用' : 'Active') : (zh ? '停用' : 'Inactive')}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <button className="btn btn-ghost" style={{ fontSize: '12px', padding: '4px 8px' }} onClick={() => openTitleForm(t)}>{zh ? '編輯' : 'Edit'}</button>
                          <button className="btn btn-ghost" style={{ fontSize: '12px', padding: '4px 8px', color: 'var(--danger)' }} onClick={() => deleteTitle(t.id)}>{zh ? '刪除' : 'Delete'}</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ════════════════════ Tab 2: Job Grades ════════════════════ */}
      {tab === 'grades' && (
        <div>
          {gradesLoading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>Loading...</div>
          ) : grades.length === 0 ? (
            <div className="card" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
              {zh ? '尚無職等資料' : 'No job grades yet'}
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{zh ? '排序' : 'Order'}</th>
                    <th>{zh ? '等級代碼' : 'Code'}</th>
                    <th>{zh ? '中文名稱' : 'Name (ZH)'}</th>
                    <th>{zh ? '英文名稱' : 'Name (EN)'}</th>
                    <th style={{ textAlign: 'right' }}>{zh ? '最低薪資' : 'Min Salary'}</th>
                    <th style={{ textAlign: 'right' }}>{zh ? '最高薪資' : 'Max Salary'}</th>
                    <th>{zh ? '說明' : 'Description'}</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {grades.map(g => (
                    <tr key={g.id}>
                      <td style={{ fontFamily: 'monospace', fontSize: '12px' }}>{g.sort_order}</td>
                      <td style={{ fontWeight: 500, fontFamily: 'monospace' }}>{g.grade_code}</td>
                      <td style={{ fontWeight: 500 }}>{g.grade_name_zh}</td>
                      <td>{g.grade_name_en || '—'}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: '12px' }}>{g.min_salary != null ? `$${g.min_salary.toLocaleString()}` : '—'}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: '12px' }}>{g.max_salary != null ? `$${g.max_salary.toLocaleString()}` : '—'}</td>
                      <td style={{ fontSize: '12px', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.description || '—'}</td>
                      <td>
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <button className="btn btn-ghost" style={{ fontSize: '12px', padding: '4px 8px' }} onClick={() => openGradeForm(g)}>{zh ? '編輯' : 'Edit'}</button>
                          <button className="btn btn-ghost" style={{ fontSize: '12px', padding: '4px 8px', color: 'var(--danger)' }} onClick={() => deleteGrade(g.id)}>{zh ? '刪除' : 'Delete'}</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ════════════════════ Tab 3: Work Rules ════════════════════ */}
      {tab === 'rules' && (
        <div>
          {rulesLoading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>Loading...</div>
          ) : rules.length === 0 ? (
            <div className="card" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
              {zh ? '尚無工作規則' : 'No work rules yet'}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {RULE_CATEGORIES.filter(cat => rulesByCategory[cat]?.length).map(cat => (
                <div key={cat} className="card" style={{ padding: '0', overflow: 'hidden' }}>
                  <div
                    style={{ padding: '12px 16px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-secondary)' }}
                    onClick={() => setExpandedCategory(expandedCategory === cat ? null : cat)}
                  >
                    <span style={{ fontWeight: 600, fontSize: '14px' }}>
                      {expandedCategory === cat ? '▼' : '▶'} {cat} ({rulesByCategory[cat].length})
                    </span>
                  </div>
                  {expandedCategory === cat && (
                    <div style={{ padding: '0' }}>
                      <table className="data-table" style={{ margin: 0 }}>
                        <thead>
                          <tr>
                            <th>{zh ? '標題' : 'Title'}</th>
                            <th>{zh ? '版本' : 'Version'}</th>
                            <th>{zh ? '生效日' : 'Effective'}</th>
                            <th>{zh ? '狀態' : 'Status'}</th>
                            <th></th>
                          </tr>
                        </thead>
                        <tbody>
                          {rulesByCategory[cat].map(r => (
                            <tr key={r.id} style={{ opacity: r.is_active ? 1 : 0.5 }}>
                              <td style={{ fontWeight: 500 }}>{r.title}</td>
                              <td style={{ fontFamily: 'monospace', fontSize: '12px' }}>{r.version || '—'}</td>
                              <td style={{ fontSize: '12px' }}>{r.effective_date || '—'}</td>
                              <td>
                                <span style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '11px', background: r.is_active ? '#dcfce7' : '#fee2e2', color: r.is_active ? '#15803d' : '#b91c1c' }}>
                                  {r.is_active ? (zh ? '啟用' : 'Active') : (zh ? '停用' : 'Inactive')}
                                </span>
                              </td>
                              <td>
                                <div style={{ display: 'flex', gap: '4px' }}>
                                  <button className="btn btn-ghost" style={{ fontSize: '12px', padding: '4px 8px' }} onClick={() => openRuleForm(r)}>{zh ? '編輯' : 'Edit'}</button>
                                  <button className="btn btn-ghost" style={{ fontSize: '12px', padding: '4px 8px', color: 'var(--danger)' }} onClick={() => deleteRule(r.id)}>{zh ? '刪除' : 'Delete'}</button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ════════════════════ Tab 4: Labor Meetings ════════════════════ */}
      {tab === 'meetings' && (
        <div>
          {meetingsLoading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>Loading...</div>
          ) : meetings.length === 0 ? (
            <div className="card" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
              {zh ? '尚無勞資會議紀錄' : 'No labor-management meeting records'}
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{zh ? '會議日期' : 'Date'}</th>
                    <th>{zh ? '會議編號' : 'Meeting #'}</th>
                    <th>{zh ? '議題' : 'Agenda'}</th>
                    <th>{zh ? '決議' : 'Resolutions'}</th>
                    <th>{zh ? '會議紀錄' : 'Minutes'}</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {meetings.map(m => (
                    <tr key={m.id}>
                      <td style={{ fontWeight: 500, whiteSpace: 'nowrap' }}>{m.meeting_date}</td>
                      <td style={{ fontFamily: 'monospace', fontSize: '12px' }}>{m.meeting_number || '—'}</td>
                      <td style={{ fontSize: '12px', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.agenda || '—'}</td>
                      <td style={{ fontSize: '12px', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.resolutions || '—'}</td>
                      <td>
                        {m.minutes_file_url ? (
                          <a href={m.minutes_file_url} target="_blank" rel="noreferrer" style={{ color: 'var(--primary)', fontSize: '12px' }}>
                            {zh ? '查看' : 'View'}
                          </a>
                        ) : '—'}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <button className="btn btn-ghost" style={{ fontSize: '12px', padding: '4px 8px' }} onClick={() => openMeetingForm(m)}>{zh ? '編輯' : 'Edit'}</button>
                          <button className="btn btn-ghost" style={{ fontSize: '12px', padding: '4px 8px', color: 'var(--danger)' }} onClick={() => deleteMeeting(m.id)}>{zh ? '刪除' : 'Delete'}</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ════════════════════ Tab 5: Harassment Prevention ════════════════════ */}
      {tab === 'harassment' && (
        <div>
          <div style={{ display: 'flex', gap: '4px', marginBottom: '16px' }}>
            <button className={`btn ${harassSubTab === 'policy' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setHarassSubTab('policy')}>
              {zh ? '防治政策' : 'Policies'}
            </button>
            <button className={`btn ${harassSubTab === 'complaints' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setHarassSubTab('complaints')}>
              {zh ? '申訴紀錄' : 'Complaints'} ({complaints.length})
            </button>
          </div>

          {harassLoading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>Loading...</div>
          ) : harassSubTab === 'policy' ? (
            policies.length === 0 ? (
              <div className="card" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                {zh ? '尚無防治政策' : 'No harassment prevention policies'}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {policies.map(p => (
                  <div key={p.id} className="card" style={{ padding: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '15px' }}>
                          {zh ? '版本' : 'Version'}: {p.policy_version || '—'}
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                          {zh ? '生效日期' : 'Effective'}: {p.effective_date || '—'}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button className="btn btn-ghost" style={{ fontSize: '12px', padding: '4px 8px' }} onClick={() => openPolicyForm(p)}>{zh ? '編輯' : 'Edit'}</button>
                        <button className="btn btn-ghost" style={{ fontSize: '12px', padding: '4px 8px', color: 'var(--danger)' }} onClick={() => deletePolicy(p.id)}>{zh ? '刪除' : 'Delete'}</button>
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
                      <div>
                        <span className="detail-label">{zh ? '負責人' : 'Responsible Person'}</span>
                        <div style={{ fontSize: '13px' }}>{p.responsible_person || '—'}</div>
                      </div>
                      <div>
                        <span className="detail-label">{zh ? '申訴管道' : 'Complaint Channel'}</span>
                        <div style={{ fontSize: '13px' }}>{p.complaint_channel || '—'}</div>
                      </div>
                    </div>
                    {p.content && (
                      <div style={{ fontSize: '13px', lineHeight: 1.6, whiteSpace: 'pre-wrap', background: 'var(--bg-secondary)', padding: '12px', borderRadius: '8px' }}>
                        {p.content}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )
          ) : (
            complaints.length === 0 ? (
              <div className="card" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                {zh ? '尚無申訴紀錄' : 'No complaint records'}
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>{zh ? '日期' : 'Date'}</th>
                      <th>{zh ? '申訴人' : 'Complainant'}</th>
                      <th>{zh ? '被申訴人' : 'Respondent'}</th>
                      <th>{zh ? '狀態' : 'Status'}</th>
                      <th>{zh ? '調查人' : 'Investigator'}</th>
                      <th>{zh ? '結案日' : 'Resolved'}</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {complaints.map(c => {
                      const st = COMPLAINT_STATUSES[c.status] || COMPLAINT_STATUSES['received'];
                      return (
                        <tr key={c.id}>
                          <td style={{ fontWeight: 500, whiteSpace: 'nowrap' }}>{c.complaint_date}</td>
                          <td>{c.is_anonymous ? (zh ? '匿名' : 'Anonymous') : (c.complainant_name || '—')}</td>
                          <td>{c.respondent_name || '—'}</td>
                          <td>
                            <span style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '11px', background: st.bg, color: st.color }}>
                              {zh ? st.zh : st.en}
                            </span>
                          </td>
                          <td style={{ fontSize: '12px' }}>{c.investigator || '—'}</td>
                          <td style={{ fontSize: '12px' }}>{c.resolved_date || '—'}</td>
                          <td>
                            <div style={{ display: 'flex', gap: '4px' }}>
                              <button className="btn btn-ghost" style={{ fontSize: '12px', padding: '4px 8px' }} onClick={() => openComplaintForm(c)}>{zh ? '編輯' : 'Edit'}</button>
                              <button className="btn btn-ghost" style={{ fontSize: '12px', padding: '4px 8px', color: 'var(--danger)' }} onClick={() => deleteComplaint(c.id)}>{zh ? '刪除' : 'Delete'}</button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )
          )}
        </div>
      )}

      {/* ════════════════════ Tab 6: Cost Centers ════════════════════ */}
      {tab === 'costcenters' && (
        <div>
          {ccLoading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>Loading...</div>
          ) : costCenters.length === 0 ? (
            <div className="card" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
              {zh ? '尚無成本中心' : 'No cost centers yet'}
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{zh ? '代碼' : 'Code'}</th>
                    <th>{zh ? '中文名稱' : 'Name (ZH)'}</th>
                    <th>{zh ? '英文名稱' : 'Name (EN)'}</th>
                    <th>{zh ? '上級中心' : 'Parent'}</th>
                    <th style={{ textAlign: 'right' }}>{zh ? '預算' : 'Budget'}</th>
                    <th>{zh ? '狀態' : 'Status'}</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {buildTree(costCenters).map(({ item: c, depth }) => (
                    <tr key={c.id} style={{ opacity: c.is_active ? 1 : 0.5 }}>
                      <td style={{ fontWeight: 500, fontFamily: 'monospace', paddingLeft: `${12 + depth * 20}px` }}>
                        {depth > 0 && '└ '}{c.center_code}
                      </td>
                      <td style={{ fontWeight: 500 }}>{c.name_zh}</td>
                      <td>{c.name_en || '—'}</td>
                      <td style={{ fontSize: '12px' }}>
                        {c.parent_id ? (costCenters.find(p => p.id === c.parent_id)?.name_zh || '—') : '—'}
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: '12px' }}>
                        {c.budget_amount != null ? `$${c.budget_amount.toLocaleString()}` : '—'}
                      </td>
                      <td>
                        <span style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '11px', background: c.is_active ? '#dcfce7' : '#fee2e2', color: c.is_active ? '#15803d' : '#b91c1c' }}>
                          {c.is_active ? (zh ? '啟用' : 'Active') : (zh ? '停用' : 'Inactive')}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <button className="btn btn-ghost" style={{ fontSize: '12px', padding: '4px 8px' }} onClick={() => openCcForm(c)}>{zh ? '編輯' : 'Edit'}</button>
                          <button className="btn btn-ghost" style={{ fontSize: '12px', padding: '4px 8px', color: 'var(--danger)' }} onClick={() => deleteCostCenter(c.id)}>{zh ? '刪除' : 'Delete'}</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ════════════════════ MODALS ════════════════════ */}

      {/* Job Title Form */}
      {showTitleForm && (
        <div style={modalOverlay}>
          <div className="card" style={modalBox}>
            <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>
              {editingTitle ? (zh ? '編輯職稱' : 'Edit Job Title') : (zh ? '新增職稱' : 'New Job Title')}
            </h3>
            <div style={{ display: 'grid', gap: '12px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={labelStyle}>{zh ? '中文名稱 *' : 'Title (ZH) *'}</label>
                  <input style={inputStyle} value={titleForm.title_zh} onChange={e => setTitleForm({ ...titleForm, title_zh: e.target.value })} />
                </div>
                <div>
                  <label style={labelStyle}>{zh ? '英文名稱' : 'Title (EN)'}</label>
                  <input style={inputStyle} value={titleForm.title_en} onChange={e => setTitleForm({ ...titleForm, title_en: e.target.value })} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={labelStyle}>{zh ? '層級' : 'Level'}</label>
                  <input style={inputStyle} value={titleForm.level} onChange={e => setTitleForm({ ...titleForm, level: e.target.value })} placeholder={zh ? '例：主管' : 'e.g. Manager'} />
                </div>
                <div>
                  <label style={labelStyle}>{zh ? '排序' : 'Sort Order'}</label>
                  <input style={inputStyle} type="number" value={titleForm.sort_order} onChange={e => setTitleForm({ ...titleForm, sort_order: Number(e.target.value) })} />
                </div>
              </div>
              <div>
                <label style={labelStyle}>{zh ? '說明' : 'Description'}</label>
                <textarea style={{ ...inputStyle, minHeight: '60px' }} value={titleForm.description} onChange={e => setTitleForm({ ...titleForm, description: e.target.value })} />
              </div>
              <div>
                <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input type="checkbox" checked={titleForm.is_active} onChange={e => setTitleForm({ ...titleForm, is_active: e.target.checked })} />
                  {zh ? '啟用' : 'Active'}
                </label>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '20px' }}>
              <button className="btn btn-ghost" onClick={() => setShowTitleForm(false)}>{zh ? '取消' : 'Cancel'}</button>
              <button className="btn btn-primary" onClick={saveTitle} disabled={saving || !titleForm.title_zh.trim()}>
                {saving ? '...' : (zh ? '儲存' : 'Save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Job Grade Form */}
      {showGradeForm && (
        <div style={modalOverlay}>
          <div className="card" style={modalBox}>
            <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>
              {editingGrade ? (zh ? '編輯職等' : 'Edit Job Grade') : (zh ? '新增職等' : 'New Job Grade')}
            </h3>
            <div style={{ display: 'grid', gap: '12px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={labelStyle}>{zh ? '等級代碼 *' : 'Code *'}</label>
                  <input style={inputStyle} value={gradeForm.grade_code} onChange={e => setGradeForm({ ...gradeForm, grade_code: e.target.value })} placeholder="G1" />
                </div>
                <div>
                  <label style={labelStyle}>{zh ? '中文名稱 *' : 'Name (ZH) *'}</label>
                  <input style={inputStyle} value={gradeForm.grade_name_zh} onChange={e => setGradeForm({ ...gradeForm, grade_name_zh: e.target.value })} />
                </div>
                <div>
                  <label style={labelStyle}>{zh ? '英文名稱' : 'Name (EN)'}</label>
                  <input style={inputStyle} value={gradeForm.grade_name_en} onChange={e => setGradeForm({ ...gradeForm, grade_name_en: e.target.value })} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={labelStyle}>{zh ? '最低薪資' : 'Min Salary'}</label>
                  <input style={inputStyle} type="number" value={gradeForm.min_salary} onChange={e => setGradeForm({ ...gradeForm, min_salary: Number(e.target.value) })} />
                </div>
                <div>
                  <label style={labelStyle}>{zh ? '最高薪資' : 'Max Salary'}</label>
                  <input style={inputStyle} type="number" value={gradeForm.max_salary} onChange={e => setGradeForm({ ...gradeForm, max_salary: Number(e.target.value) })} />
                </div>
                <div>
                  <label style={labelStyle}>{zh ? '排序' : 'Sort Order'}</label>
                  <input style={inputStyle} type="number" value={gradeForm.sort_order} onChange={e => setGradeForm({ ...gradeForm, sort_order: Number(e.target.value) })} />
                </div>
              </div>
              <div>
                <label style={labelStyle}>{zh ? '說明' : 'Description'}</label>
                <textarea style={{ ...inputStyle, minHeight: '60px' }} value={gradeForm.description} onChange={e => setGradeForm({ ...gradeForm, description: e.target.value })} />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '20px' }}>
              <button className="btn btn-ghost" onClick={() => setShowGradeForm(false)}>{zh ? '取消' : 'Cancel'}</button>
              <button className="btn btn-primary" onClick={saveGrade} disabled={saving || !gradeForm.grade_code.trim() || !gradeForm.grade_name_zh.trim()}>
                {saving ? '...' : (zh ? '儲存' : 'Save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Work Rule Form */}
      {showRuleForm && (
        <div style={modalOverlay}>
          <div className="card" style={{ ...modalBox, width: '640px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>
              {editingRule ? (zh ? '編輯工作規則' : 'Edit Work Rule') : (zh ? '新增工作規則' : 'New Work Rule')}
            </h3>
            <div style={{ display: 'grid', gap: '12px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '12px' }}>
                <div>
                  <label style={labelStyle}>{zh ? '分類 *' : 'Category *'}</label>
                  <select style={inputStyle} value={ruleForm.rule_category} onChange={e => setRuleForm({ ...ruleForm, rule_category: e.target.value })}>
                    {RULE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>{zh ? '標題 *' : 'Title *'}</label>
                  <input style={inputStyle} value={ruleForm.title} onChange={e => setRuleForm({ ...ruleForm, title: e.target.value })} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={labelStyle}>{zh ? '版本' : 'Version'}</label>
                  <input style={inputStyle} value={ruleForm.version} onChange={e => setRuleForm({ ...ruleForm, version: e.target.value })} placeholder="v1.0" />
                </div>
                <div>
                  <label style={labelStyle}>{zh ? '生效日期' : 'Effective Date'}</label>
                  <input style={inputStyle} type="date" value={ruleForm.effective_date} onChange={e => setRuleForm({ ...ruleForm, effective_date: e.target.value })} />
                </div>
              </div>
              <div>
                <label style={labelStyle}>{zh ? '內容' : 'Content'}</label>
                <textarea style={{ ...inputStyle, minHeight: '160px' }} value={ruleForm.content} onChange={e => setRuleForm({ ...ruleForm, content: e.target.value })} />
              </div>
              <div>
                <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input type="checkbox" checked={ruleForm.is_active} onChange={e => setRuleForm({ ...ruleForm, is_active: e.target.checked })} />
                  {zh ? '啟用' : 'Active'}
                </label>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '20px' }}>
              <button className="btn btn-ghost" onClick={() => setShowRuleForm(false)}>{zh ? '取消' : 'Cancel'}</button>
              <button className="btn btn-primary" onClick={saveRule} disabled={saving || !ruleForm.title.trim()}>
                {saving ? '...' : (zh ? '儲存' : 'Save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Labor Meeting Form */}
      {showMeetingForm && (
        <div style={modalOverlay}>
          <div className="card" style={{ ...modalBox, width: '640px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>
              {editingMeeting ? (zh ? '編輯勞資會議' : 'Edit Meeting') : (zh ? '新增勞資會議' : 'New Meeting')}
            </h3>
            <div style={{ display: 'grid', gap: '12px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={labelStyle}>{zh ? '會議日期 *' : 'Meeting Date *'}</label>
                  <input style={inputStyle} type="date" value={meetingForm.meeting_date} onChange={e => setMeetingForm({ ...meetingForm, meeting_date: e.target.value })} />
                </div>
                <div>
                  <label style={labelStyle}>{zh ? '會議編號' : 'Meeting Number'}</label>
                  <input style={inputStyle} value={meetingForm.meeting_number} onChange={e => setMeetingForm({ ...meetingForm, meeting_number: e.target.value })} placeholder="LM-2026-001" />
                </div>
              </div>
              <div>
                <label style={labelStyle}>{zh ? '出席人員' : 'Attendees'}</label>
                <textarea style={{ ...inputStyle, minHeight: '60px' }} value={meetingForm.attendees} onChange={e => setMeetingForm({ ...meetingForm, attendees: e.target.value })} placeholder={zh ? '每行一位出席人員' : 'One attendee per line'} />
              </div>
              <div>
                <label style={labelStyle}>{zh ? '議題' : 'Agenda'}</label>
                <textarea style={{ ...inputStyle, minHeight: '80px' }} value={meetingForm.agenda} onChange={e => setMeetingForm({ ...meetingForm, agenda: e.target.value })} />
              </div>
              <div>
                <label style={labelStyle}>{zh ? '決議事項' : 'Resolutions'}</label>
                <textarea style={{ ...inputStyle, minHeight: '80px' }} value={meetingForm.resolutions} onChange={e => setMeetingForm({ ...meetingForm, resolutions: e.target.value })} />
              </div>
              <div>
                <label style={labelStyle}>{zh ? '備註' : 'Notes'}</label>
                <textarea style={{ ...inputStyle, minHeight: '60px' }} value={meetingForm.notes} onChange={e => setMeetingForm({ ...meetingForm, notes: e.target.value })} />
              </div>
              <div>
                <label style={labelStyle}>{zh ? '會議紀錄檔案 URL' : 'Minutes File URL'}</label>
                <input style={inputStyle} value={meetingForm.minutes_file_url} onChange={e => setMeetingForm({ ...meetingForm, minutes_file_url: e.target.value })} placeholder="https://..." />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '20px' }}>
              <button className="btn btn-ghost" onClick={() => setShowMeetingForm(false)}>{zh ? '取消' : 'Cancel'}</button>
              <button className="btn btn-primary" onClick={saveMeeting} disabled={saving || !meetingForm.meeting_date}>
                {saving ? '...' : (zh ? '儲存' : 'Save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Harassment Policy Form */}
      {showPolicyForm && (
        <div style={modalOverlay}>
          <div className="card" style={{ ...modalBox, width: '640px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>
              {editingPolicy ? (zh ? '編輯防治政策' : 'Edit Policy') : (zh ? '新增防治政策' : 'New Policy')}
            </h3>
            <div style={{ display: 'grid', gap: '12px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={labelStyle}>{zh ? '版本 *' : 'Version *'}</label>
                  <input style={inputStyle} value={policyForm.policy_version} onChange={e => setPolicyForm({ ...policyForm, policy_version: e.target.value })} placeholder="v1.0" />
                </div>
                <div>
                  <label style={labelStyle}>{zh ? '生效日期' : 'Effective Date'}</label>
                  <input style={inputStyle} type="date" value={policyForm.effective_date} onChange={e => setPolicyForm({ ...policyForm, effective_date: e.target.value })} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={labelStyle}>{zh ? '負責人' : 'Responsible Person'}</label>
                  <input style={inputStyle} value={policyForm.responsible_person} onChange={e => setPolicyForm({ ...policyForm, responsible_person: e.target.value })} />
                </div>
                <div>
                  <label style={labelStyle}>{zh ? '申訴管道' : 'Complaint Channel'}</label>
                  <input style={inputStyle} value={policyForm.complaint_channel} onChange={e => setPolicyForm({ ...policyForm, complaint_channel: e.target.value })} placeholder={zh ? '信箱 / 電話 / 表單' : 'Email / Phone / Form'} />
                </div>
              </div>
              <div>
                <label style={labelStyle}>{zh ? '政策內容' : 'Policy Content'}</label>
                <textarea style={{ ...inputStyle, minHeight: '200px' }} value={policyForm.content} onChange={e => setPolicyForm({ ...policyForm, content: e.target.value })} />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '20px' }}>
              <button className="btn btn-ghost" onClick={() => setShowPolicyForm(false)}>{zh ? '取消' : 'Cancel'}</button>
              <button className="btn btn-primary" onClick={savePolicy} disabled={saving || !policyForm.policy_version.trim()}>
                {saving ? '...' : (zh ? '儲存' : 'Save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Harassment Complaint Form */}
      {showComplaintForm && (
        <div style={modalOverlay}>
          <div className="card" style={{ ...modalBox, width: '640px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>
              {editingComplaint ? (zh ? '編輯申訴紀錄' : 'Edit Complaint') : (zh ? '新增申訴紀錄' : 'New Complaint')}
            </h3>
            <div style={{ display: 'grid', gap: '12px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={labelStyle}>{zh ? '申訴日期 *' : 'Complaint Date *'}</label>
                  <input style={inputStyle} type="date" value={complaintForm.complaint_date} onChange={e => setComplaintForm({ ...complaintForm, complaint_date: e.target.value })} />
                </div>
                <div>
                  <label style={labelStyle}>{zh ? '狀態' : 'Status'}</label>
                  <select style={inputStyle} value={complaintForm.status} onChange={e => setComplaintForm({ ...complaintForm, status: e.target.value })}>
                    {Object.entries(COMPLAINT_STATUSES).map(([k, v]) => (
                      <option key={k} value={k}>{zh ? v.zh : v.en}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input type="checkbox" checked={complaintForm.is_anonymous} onChange={e => setComplaintForm({ ...complaintForm, is_anonymous: e.target.checked })} />
                  {zh ? '匿名申訴' : 'Anonymous'}
                </label>
              </div>
              {!complaintForm.is_anonymous && (
                <div>
                  <label style={labelStyle}>{zh ? '申訴人姓名' : 'Complainant Name'}</label>
                  <input style={inputStyle} value={complaintForm.complainant_name} onChange={e => setComplaintForm({ ...complaintForm, complainant_name: e.target.value })} />
                </div>
              )}
              <div>
                <label style={labelStyle}>{zh ? '被申訴人姓名' : 'Respondent Name'}</label>
                <input style={inputStyle} value={complaintForm.respondent_name} onChange={e => setComplaintForm({ ...complaintForm, respondent_name: e.target.value })} />
              </div>
              <div>
                <label style={labelStyle}>{zh ? '事件描述' : 'Description'}</label>
                <textarea style={{ ...inputStyle, minHeight: '100px' }} value={complaintForm.description} onChange={e => setComplaintForm({ ...complaintForm, description: e.target.value })} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={labelStyle}>{zh ? '調查人' : 'Investigator'}</label>
                  <input style={inputStyle} value={complaintForm.investigator} onChange={e => setComplaintForm({ ...complaintForm, investigator: e.target.value })} />
                </div>
                <div>
                  <label style={labelStyle}>{zh ? '結案日期' : 'Resolved Date'}</label>
                  <input style={inputStyle} type="date" value={complaintForm.resolved_date} onChange={e => setComplaintForm({ ...complaintForm, resolved_date: e.target.value })} />
                </div>
              </div>
              <div>
                <label style={labelStyle}>{zh ? '處理結果' : 'Resolution'}</label>
                <textarea style={{ ...inputStyle, minHeight: '80px' }} value={complaintForm.resolution} onChange={e => setComplaintForm({ ...complaintForm, resolution: e.target.value })} />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '20px' }}>
              <button className="btn btn-ghost" onClick={() => setShowComplaintForm(false)}>{zh ? '取消' : 'Cancel'}</button>
              <button className="btn btn-primary" onClick={saveComplaint} disabled={saving || !complaintForm.complaint_date}>
                {saving ? '...' : (zh ? '儲存' : 'Save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cost Center Form */}
      {showCcForm && (
        <div style={modalOverlay}>
          <div className="card" style={modalBox}>
            <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>
              {editingCc ? (zh ? '編輯成本中心' : 'Edit Cost Center') : (zh ? '新增成本中心' : 'New Cost Center')}
            </h3>
            <div style={{ display: 'grid', gap: '12px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={labelStyle}>{zh ? '代碼 *' : 'Code *'}</label>
                  <input style={inputStyle} value={ccForm.center_code} onChange={e => setCcForm({ ...ccForm, center_code: e.target.value })} placeholder="CC-001" />
                </div>
                <div>
                  <label style={labelStyle}>{zh ? '上級中心' : 'Parent Center'}</label>
                  <select style={inputStyle} value={ccForm.parent_id} onChange={e => setCcForm({ ...ccForm, parent_id: e.target.value })}>
                    <option value="">{zh ? '無 (頂層)' : 'None (Top Level)'}</option>
                    {costCenters.filter(c => c.id !== editingCc?.id).map(c => (
                      <option key={c.id} value={c.id}>{c.center_code} - {c.name_zh}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={labelStyle}>{zh ? '中文名稱 *' : 'Name (ZH) *'}</label>
                  <input style={inputStyle} value={ccForm.name_zh} onChange={e => setCcForm({ ...ccForm, name_zh: e.target.value })} />
                </div>
                <div>
                  <label style={labelStyle}>{zh ? '英文名稱' : 'Name (EN)'}</label>
                  <input style={inputStyle} value={ccForm.name_en} onChange={e => setCcForm({ ...ccForm, name_en: e.target.value })} />
                </div>
              </div>
              <div>
                <label style={labelStyle}>{zh ? '預算金額' : 'Budget Amount'}</label>
                <input style={inputStyle} type="number" value={ccForm.budget_amount} onChange={e => setCcForm({ ...ccForm, budget_amount: Number(e.target.value) })} />
              </div>
              <div>
                <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input type="checkbox" checked={ccForm.is_active} onChange={e => setCcForm({ ...ccForm, is_active: e.target.checked })} />
                  {zh ? '啟用' : 'Active'}
                </label>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '20px' }}>
              <button className="btn btn-ghost" onClick={() => setShowCcForm(false)}>{zh ? '取消' : 'Cancel'}</button>
              <button className="btn btn-primary" onClick={saveCostCenter} disabled={saving || !ccForm.center_code.trim() || !ccForm.name_zh.trim()}>
                {saving ? '...' : (zh ? '儲存' : 'Save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
