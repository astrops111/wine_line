import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { getLocale } from '../lib/i18n';
import { useOrg } from '../lib/OrgContext';

// ─── Types ───────────────────────────────────────────────────────────────────

interface InsuranceUnit {
  id?: string;
  org_id: string;
  company_name: string;
  business_reg_number: string;
  labor_ins_unit_code: string;
  health_ins_unit_code: string;
  responsible_person: string;
  contact_phone: string;
  contact_email: string;
  address: string;
  effective_date: string;
}

interface InsuranceRuleHistory {
  id: string;
  org_id: string;
  effective_date: string;
  rule_type: string;
  description: string;
  old_value: string;
  new_value: string;
  changed_by: string;
  created_at: string;
}

interface EmployeeInsurance {
  id: string;
  org_id: string;
  user_id: string;
  labor_ins_grade: number | null;
  health_ins_grade: number | null;
  pension_rate: number | null;
  enrollment_date: string;
  is_enrolled: boolean;
  users?: { name: string };
}

interface InsuranceDependent {
  id: string;
  employee_insurance_id: string;
  dependent_name: string;
  relationship: string;
  birth_date: string;
  id_number: string;
  health_ins_enrolled: boolean;
  enrollment_date: string;
}

interface InsuranceChange {
  id: string;
  org_id: string;
  user_id: string;
  change_date: string;
  change_type: string;
  old_value: string;
  new_value: string;
  status: string;
  notes: string;
  submitted_at: string | null;
  users?: { name: string };
}

interface ComparisonRow {
  employee: string;
  calculated_labor_ins: number;
  actual_labor_ins: number;
  labor_diff: number;
  calculated_health_ins: number;
  actual_health_ins: number;
  health_diff: number;
  calculated_pension: number;
  actual_pension: number;
  pension_diff: number;
}

type TabKey = 'unit' | 'rules' | 'employees' | 'changes' | 'comparison';

const CHANGE_TYPES = ['加保', '退保', '薪調', '眷屬異動'];
const CHANGE_STATUSES: Record<string, { bg: string; color: string; label: string; labelEn: string }> = {
  pending:   { bg: '#fef3c7', color: '#92400e', label: '待處理', labelEn: 'Pending' },
  submitted: { bg: '#dbeafe', color: '#1d4ed8', label: '已申報', labelEn: 'Submitted' },
  completed: { bg: '#dcfce7', color: '#15803d', label: '已完成', labelEn: 'Completed' },
};

const RELATIONSHIPS = ['配偶', '子女', '父母', '祖父母', '其他'];

// ─── Main Component ──────────────────────────────────────────────────────────

export function InsuranceManagement() {
  const zh = getLocale() === 'zh-TW';
  const { orgId, currentUser } = useOrg();
  const [tab, setTab] = useState<TabKey>('unit');

  const inputStyle = { width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: '13px' };
  const labelStyle = { fontSize: '12px', fontWeight: 600 as const, color: 'var(--text-secondary)', marginBottom: '4px', display: 'block' };

  // ── Tab 1: Insurance Unit Setup ──────────────────────────────────────────
  const [unitForm, setUnitForm] = useState<InsuranceUnit>({
    org_id: '', company_name: '', business_reg_number: '', labor_ins_unit_code: '',
    health_ins_unit_code: '', responsible_person: '', contact_phone: '', contact_email: '',
    address: '', effective_date: new Date().toISOString().split('T')[0],
  });
  const [unitLoading, setUnitLoading] = useState(true);
  const [unitSaving, setUnitSaving] = useState(false);
  const [unitExists, setUnitExists] = useState(false);

  // ── Tab 2: Rule History ──────────────────────────────────────────────────
  const [ruleHistory, setRuleHistory] = useState<InsuranceRuleHistory[]>([]);
  const [ruleLoading, setRuleLoading] = useState(true);
  const [ruleFilter, setRuleFilter] = useState('all');
  const [ruleDateFrom, setRuleDateFrom] = useState('');
  const [ruleDateTo, setRuleDateTo] = useState('');
  const [showRuleForm, setShowRuleForm] = useState(false);
  const [ruleForm, setRuleForm] = useState({ effective_date: new Date().toISOString().split('T')[0], rule_type: 'labor', description: '', old_value: '', new_value: '' });
  const [ruleSaving, setRuleSaving] = useState(false);

  // ── Tab 3: Employee & Dependent Insurance ────────────────────────────────
  const [empInsurance, setEmpInsurance] = useState<EmployeeInsurance[]>([]);
  const [empLoading, setEmpLoading] = useState(true);
  const [showEmpForm, setShowEmpForm] = useState(false);
  const [editingEmp, setEditingEmp] = useState<EmployeeInsurance | null>(null);
  const [empForm, setEmpForm] = useState({ user_id: '', labor_ins_grade: '', health_ins_grade: '', pension_rate: '6', enrollment_date: new Date().toISOString().split('T')[0], is_enrolled: true });
  const [empSaving, setEmpSaving] = useState(false);
  const [orgUsers, setOrgUsers] = useState<{ id: string; name: string }[]>([]);
  // Dependents
  const [selectedEmpInsId, setSelectedEmpInsId] = useState<string | null>(null);
  const [dependents, setDependents] = useState<InsuranceDependent[]>([]);
  const [depLoading, setDepLoading] = useState(false);
  const [showDepForm, setShowDepForm] = useState(false);
  const [editingDep, setEditingDep] = useState<InsuranceDependent | null>(null);
  const [depForm, setDepForm] = useState({ dependent_name: '', relationship: '配偶', birth_date: '', id_number: '', health_ins_enrolled: true, enrollment_date: new Date().toISOString().split('T')[0] });
  const [depSaving, setDepSaving] = useState(false);

  // ── Tab 4: Insurance Changes ─────────────────────────────────────────────
  const [changes, setChanges] = useState<InsuranceChange[]>([]);
  const [changeLoading, setChangeLoading] = useState(true);
  const [changeTypeFilter, setChangeTypeFilter] = useState('all');
  const [changeDateFrom, setChangeDateFrom] = useState('');
  const [changeDateTo, setChangeDateTo] = useState('');
  const [changeEmpFilter, setChangeEmpFilter] = useState('');
  const [showChangeForm, setShowChangeForm] = useState(false);
  const [changeForm, setChangeForm] = useState({ user_id: '', change_date: new Date().toISOString().split('T')[0], change_type: '加保', old_value: '', new_value: '', status: 'pending', notes: '' });
  const [changeSaving, setChangeSaving] = useState(false);

  // ── Tab 5: Deduction Comparison ──────────────────────────────────────────
  const [comparisonData, setComparisonData] = useState<ComparisonRow[]>([]);
  const [comparisonLoading, setComparisonLoading] = useState(false);

  // ─── Data Loading ──────────────────────────────────────────────────────────

  const loadUnit = useCallback(async () => {
    if (!orgId) return;
    setUnitLoading(true);
    const { data } = await supabase
      .from('insurance_units')
      .select('*')
      .eq('org_id', orgId)
      .maybeSingle();
    if (data) {
      setUnitForm(data);
      setUnitExists(true);
    } else {
      setUnitForm(prev => ({ ...prev, org_id: orgId }));
      setUnitExists(false);
    }
    setUnitLoading(false);
  }, [orgId]);

  const loadRuleHistory = useCallback(async () => {
    if (!orgId) return;
    setRuleLoading(true);
    let q = supabase
      .from('insurance_rule_history')
      .select('*')
      .eq('org_id', orgId)
      .order('effective_date', { ascending: false });
    if (ruleFilter !== 'all') q = q.eq('rule_type', ruleFilter);
    if (ruleDateFrom) q = q.gte('effective_date', ruleDateFrom);
    if (ruleDateTo) q = q.lte('effective_date', ruleDateTo);
    const { data } = await q;
    setRuleHistory(data || []);
    setRuleLoading(false);
  }, [orgId, ruleFilter, ruleDateFrom, ruleDateTo]);

  const loadOrgUsers = useCallback(async () => {
    if (!orgId) return;
    const { data } = await supabase
      .from('users')
      .select('id, name')
      .eq('organization_id', orgId)
      .order('name');
    setOrgUsers(data || []);
  }, [orgId]);

  const loadEmpInsurance = useCallback(async () => {
    if (!orgId) return;
    setEmpLoading(true);
    const { data } = await supabase
      .from('employee_insurance')
      .select('*, users(name)')
      .eq('org_id', orgId)
      .order('enrollment_date', { ascending: false });
    setEmpInsurance(data || []);
    setEmpLoading(false);
  }, [orgId]);

  const loadDependents = useCallback(async (empInsId: string) => {
    setDepLoading(true);
    const { data } = await supabase
      .from('insurance_dependents')
      .select('*')
      .eq('employee_insurance_id', empInsId)
      .order('dependent_name');
    setDependents(data || []);
    setDepLoading(false);
  }, []);

  const loadChanges = useCallback(async () => {
    if (!orgId) return;
    setChangeLoading(true);
    let q = supabase
      .from('insurance_changes')
      .select('*, users(name)')
      .eq('org_id', orgId)
      .order('change_date', { ascending: false });
    if (changeTypeFilter !== 'all') q = q.eq('change_type', changeTypeFilter);
    if (changeDateFrom) q = q.gte('change_date', changeDateFrom);
    if (changeDateTo) q = q.lte('change_date', changeDateTo);
    if (changeEmpFilter) q = q.eq('user_id', changeEmpFilter);
    const { data } = await q;
    setChanges(data || []);
    setChangeLoading(false);
  }, [orgId, changeTypeFilter, changeDateFrom, changeDateTo, changeEmpFilter]);

  useEffect(() => {
    if (!orgId) return;
    loadOrgUsers();
  }, [orgId, loadOrgUsers]);

  useEffect(() => {
    if (!orgId) return;
    if (tab === 'unit') loadUnit();
    if (tab === 'rules') loadRuleHistory();
    if (tab === 'employees') loadEmpInsurance();
    if (tab === 'changes') loadChanges();
  }, [tab, orgId, loadUnit, loadRuleHistory, loadEmpInsurance, loadChanges]);

  useEffect(() => {
    if (selectedEmpInsId) loadDependents(selectedEmpInsId);
  }, [selectedEmpInsId, loadDependents]);

  // ─── Tab 1 Handlers ───────────────────────────────────────────────────────

  const saveUnit = async () => {
    setUnitSaving(true);
    const payload = { ...unitForm, org_id: orgId };
    if (unitExists && unitForm.id) {
      await supabase.from('insurance_units').update(payload).eq('id', unitForm.id);
    } else {
      await supabase.from('insurance_units').insert(payload);
    }
    setUnitSaving(false);
    loadUnit();
  };

  // ─── Tab 2 Handlers ───────────────────────────────────────────────────────

  const saveRule = async () => {
    if (!ruleForm.description.trim()) return;
    setRuleSaving(true);
    await supabase.from('insurance_rule_history').insert({
      org_id: orgId,
      effective_date: ruleForm.effective_date,
      rule_type: ruleForm.rule_type,
      description: ruleForm.description,
      old_value: ruleForm.old_value,
      new_value: ruleForm.new_value,
      changed_by: currentUser?.name || currentUser?.id || '',
    });
    setRuleSaving(false);
    setShowRuleForm(false);
    setRuleForm({ effective_date: new Date().toISOString().split('T')[0], rule_type: 'labor', description: '', old_value: '', new_value: '' });
    loadRuleHistory();
  };

  // ─── Tab 3 Handlers ───────────────────────────────────────────────────────

  const openEmpForm = (e?: EmployeeInsurance) => {
    if (e) {
      setEditingEmp(e);
      setEmpForm({
        user_id: e.user_id,
        labor_ins_grade: e.labor_ins_grade?.toString() || '',
        health_ins_grade: e.health_ins_grade?.toString() || '',
        pension_rate: e.pension_rate?.toString() || '6',
        enrollment_date: e.enrollment_date || new Date().toISOString().split('T')[0],
        is_enrolled: e.is_enrolled,
      });
    } else {
      setEditingEmp(null);
      setEmpForm({ user_id: '', labor_ins_grade: '', health_ins_grade: '', pension_rate: '6', enrollment_date: new Date().toISOString().split('T')[0], is_enrolled: true });
    }
    setShowEmpForm(true);
  };

  const saveEmpInsurance = async () => {
    if (!empForm.user_id) return;
    setEmpSaving(true);
    const payload = {
      org_id: orgId,
      user_id: empForm.user_id,
      labor_ins_grade: empForm.labor_ins_grade ? parseInt(empForm.labor_ins_grade) : null,
      health_ins_grade: empForm.health_ins_grade ? parseInt(empForm.health_ins_grade) : null,
      pension_rate: empForm.pension_rate ? parseFloat(empForm.pension_rate) : null,
      enrollment_date: empForm.enrollment_date,
      is_enrolled: empForm.is_enrolled,
    };
    if (editingEmp) {
      await supabase.from('employee_insurance').update(payload).eq('id', editingEmp.id);
    } else {
      await supabase.from('employee_insurance').insert(payload);
    }
    setEmpSaving(false);
    setShowEmpForm(false);
    loadEmpInsurance();
  };

  const deleteEmpInsurance = async (id: string) => {
    if (!confirm(zh ? '確定刪除此員工保險紀錄？' : 'Delete this employee insurance record?')) return;
    await supabase.from('insurance_dependents').delete().eq('employee_insurance_id', id);
    await supabase.from('employee_insurance').delete().eq('id', id);
    if (selectedEmpInsId === id) { setSelectedEmpInsId(null); setDependents([]); }
    loadEmpInsurance();
  };

  const openDepForm = (d?: InsuranceDependent) => {
    if (d) {
      setEditingDep(d);
      setDepForm({
        dependent_name: d.dependent_name,
        relationship: d.relationship,
        birth_date: d.birth_date || '',
        id_number: d.id_number || '',
        health_ins_enrolled: d.health_ins_enrolled,
        enrollment_date: d.enrollment_date || new Date().toISOString().split('T')[0],
      });
    } else {
      setEditingDep(null);
      setDepForm({ dependent_name: '', relationship: '配偶', birth_date: '', id_number: '', health_ins_enrolled: true, enrollment_date: new Date().toISOString().split('T')[0] });
    }
    setShowDepForm(true);
  };

  const saveDependent = async () => {
    if (!depForm.dependent_name.trim() || !selectedEmpInsId) return;
    setDepSaving(true);
    const payload = {
      employee_insurance_id: selectedEmpInsId,
      dependent_name: depForm.dependent_name,
      relationship: depForm.relationship,
      birth_date: depForm.birth_date || null,
      id_number: depForm.id_number || null,
      health_ins_enrolled: depForm.health_ins_enrolled,
      enrollment_date: depForm.enrollment_date,
    };
    if (editingDep) {
      await supabase.from('insurance_dependents').update(payload).eq('id', editingDep.id);
    } else {
      await supabase.from('insurance_dependents').insert(payload);
    }
    setDepSaving(false);
    setShowDepForm(false);
    loadDependents(selectedEmpInsId);
  };

  const deleteDependent = async (id: string) => {
    if (!confirm(zh ? '確定刪除此眷屬？' : 'Delete this dependent?')) return;
    await supabase.from('insurance_dependents').delete().eq('id', id);
    if (selectedEmpInsId) loadDependents(selectedEmpInsId);
  };

  // ─── Tab 4 Handlers ───────────────────────────────────────────────────────

  const saveChange = async () => {
    if (!changeForm.user_id) return;
    setChangeSaving(true);
    await supabase.from('insurance_changes').insert({
      org_id: orgId,
      user_id: changeForm.user_id,
      change_date: changeForm.change_date,
      change_type: changeForm.change_type,
      old_value: changeForm.old_value || null,
      new_value: changeForm.new_value || null,
      status: changeForm.status,
      notes: changeForm.notes || null,
    });
    setChangeSaving(false);
    setShowChangeForm(false);
    setChangeForm({ user_id: '', change_date: new Date().toISOString().split('T')[0], change_type: '加保', old_value: '', new_value: '', status: 'pending', notes: '' });
    loadChanges();
  };

  const updateChangeStatus = async (id: string, status: string) => {
    const updates: any = { status };
    if (status === 'submitted') updates.submitted_at = new Date().toISOString();
    await supabase.from('insurance_changes').update(updates).eq('id', id);
    loadChanges();
  };

  // ─── Tab 5 Handlers ───────────────────────────────────────────────────────

  const handleCSVUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setComparisonLoading(true);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const lines = text.split('\n').filter(l => l.trim());
      if (lines.length < 2) { setComparisonLoading(false); return; }

      // Expected CSV columns: employee, actual_labor_ins, actual_health_ins, actual_pension
      const rows: ComparisonRow[] = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',').map(c => c.trim());
        if (cols.length < 4) continue;
        const empName = cols[0];
        const actualLabor = parseFloat(cols[1]) || 0;
        const actualHealth = parseFloat(cols[2]) || 0;
        const actualPension = parseFloat(cols[3]) || 0;

        // Find matching employee insurance for calculated values
        const match = empInsurance.find(ei => (ei.users?.name || '') === empName);
        const calcLabor = match?.labor_ins_grade ? Math.round(match.labor_ins_grade * 0.115 * 0.2) : 0;
        const calcHealth = match?.health_ins_grade ? Math.round(match.health_ins_grade * 0.0517 * 0.3) : 0;
        const calcPension = match?.labor_ins_grade && match?.pension_rate ? Math.round(match.labor_ins_grade * (match.pension_rate / 100)) : 0;

        rows.push({
          employee: empName,
          calculated_labor_ins: calcLabor,
          actual_labor_ins: actualLabor,
          labor_diff: actualLabor - calcLabor,
          calculated_health_ins: calcHealth,
          actual_health_ins: actualHealth,
          health_diff: actualHealth - calcHealth,
          calculated_pension: calcPension,
          actual_pension: actualPension,
          pension_diff: actualPension - calcPension,
        });
      }
      setComparisonData(rows);
      setComparisonLoading(false);
    };
    reader.readAsText(file);
  };

  const maskId = (id: string) => {
    if (!id || id.length < 4) return id || '';
    return id.slice(0, 2) + '****' + id.slice(-2);
  };

  const getUserName = (userId: string) => {
    const u = orgUsers.find(u => u.id === userId);
    return u?.name || userId;
  };

  // ─── Tabs Configuration ────────────────────────────────────────────────────

  const tabs: { key: TabKey; icon: string; zh: string; en: string }[] = [
    { key: 'unit',       icon: '🏢', zh: '申報與投保單位設定', en: 'Insurance Unit Setup' },
    { key: 'rules',      icon: '📜', zh: '保險規則歷程',       en: 'Rule History' },
    { key: 'employees',  icon: '👥', zh: '員工與眷屬保險作業', en: 'Employee & Dependent' },
    { key: 'changes',    icon: '📝', zh: '保險異動紀錄查詢',   en: 'Change Records' },
    { key: 'comparison', icon: '📊', zh: '保險扣繳差異比對',   en: 'Deduction Comparison' },
  ];

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: 700 }}>
          {zh ? '🛡️ 勞健保管理' : '🛡️ Insurance Management'}
        </h2>
      </div>

      {/* Tab Bar */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '20px', flexWrap: 'wrap' }}>
        {tabs.map(t => (
          <button key={t.key} className={`btn ${tab === t.key ? 'btn-primary' : 'btn-ghost'}`}
            style={{ fontSize: '13px' }} onClick={() => setTab(t.key)}>
            {t.icon} {zh ? t.zh : t.en}
          </button>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* Tab 1: Insurance Unit Setup                                          */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {tab === 'unit' && (
        <div className="card" style={{ padding: '24px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>
            {zh ? '投保單位基本設定' : 'Insurance Unit Configuration'}
          </h3>
          {unitLoading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>Loading...</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
              <div>
                <label style={labelStyle}>{zh ? '公司名稱' : 'Company Name'}</label>
                <input style={inputStyle} value={unitForm.company_name} onChange={e => setUnitForm({ ...unitForm, company_name: e.target.value })} />
              </div>
              <div>
                <label style={labelStyle}>{zh ? '統一編號' : 'Business Registration No.'}</label>
                <input style={inputStyle} value={unitForm.business_reg_number} onChange={e => setUnitForm({ ...unitForm, business_reg_number: e.target.value })} />
              </div>
              <div>
                <label style={labelStyle}>{zh ? '勞保投保單位代號' : 'Labor Insurance Unit Code'}</label>
                <input style={inputStyle} value={unitForm.labor_ins_unit_code} onChange={e => setUnitForm({ ...unitForm, labor_ins_unit_code: e.target.value })} />
              </div>
              <div>
                <label style={labelStyle}>{zh ? '健保投保單位代號' : 'Health Insurance Unit Code'}</label>
                <input style={inputStyle} value={unitForm.health_ins_unit_code} onChange={e => setUnitForm({ ...unitForm, health_ins_unit_code: e.target.value })} />
              </div>
              <div>
                <label style={labelStyle}>{zh ? '負責人' : 'Responsible Person'}</label>
                <input style={inputStyle} value={unitForm.responsible_person} onChange={e => setUnitForm({ ...unitForm, responsible_person: e.target.value })} />
              </div>
              <div>
                <label style={labelStyle}>{zh ? '聯絡電話' : 'Contact Phone'}</label>
                <input style={inputStyle} value={unitForm.contact_phone} onChange={e => setUnitForm({ ...unitForm, contact_phone: e.target.value })} />
              </div>
              <div>
                <label style={labelStyle}>{zh ? '聯絡信箱' : 'Contact Email'}</label>
                <input style={inputStyle} type="email" value={unitForm.contact_email} onChange={e => setUnitForm({ ...unitForm, contact_email: e.target.value })} />
              </div>
              <div>
                <label style={labelStyle}>{zh ? '生效日期' : 'Effective Date'}</label>
                <input style={inputStyle} type="date" value={unitForm.effective_date} onChange={e => setUnitForm({ ...unitForm, effective_date: e.target.value })} />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={labelStyle}>{zh ? '地址' : 'Address'}</label>
                <input style={inputStyle} value={unitForm.address} onChange={e => setUnitForm({ ...unitForm, address: e.target.value })} />
              </div>
              <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button className="btn btn-primary" onClick={saveUnit} disabled={unitSaving}>
                  {unitSaving ? (zh ? '儲存中...' : 'Saving...') : (unitExists ? (zh ? '更新設定' : 'Update') : (zh ? '建立設定' : 'Create'))}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* Tab 2: Insurance Rule History                                        */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {tab === 'rules' && (
        <div>
          {/* Filters */}
          <div className="card" style={{ padding: '16px', marginBottom: '16px', display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div>
              <label style={labelStyle}>{zh ? '規則類型' : 'Rule Type'}</label>
              <select style={inputStyle} value={ruleFilter} onChange={e => setRuleFilter(e.target.value)}>
                <option value="all">{zh ? '全部' : 'All'}</option>
                <option value="labor">{zh ? '勞保' : 'Labor Ins.'}</option>
                <option value="health">{zh ? '健保' : 'Health Ins.'}</option>
                <option value="pension">{zh ? '勞退' : 'Pension'}</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>{zh ? '起始日期' : 'From'}</label>
              <input style={inputStyle} type="date" value={ruleDateFrom} onChange={e => setRuleDateFrom(e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>{zh ? '結束日期' : 'To'}</label>
              <input style={inputStyle} type="date" value={ruleDateTo} onChange={e => setRuleDateTo(e.target.value)} />
            </div>
            <button className="btn btn-primary" onClick={() => setShowRuleForm(true)}>
              + {zh ? '新增紀錄' : 'Add Entry'}
            </button>
          </div>

          {/* Rule Form Modal */}
          {showRuleForm && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
              onClick={() => setShowRuleForm(false)}>
              <div className="card" style={{ padding: '24px', width: '480px', maxWidth: '95vw' }} onClick={e => e.stopPropagation()}>
                <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>{zh ? '新增保險規則變更紀錄' : 'Add Insurance Rule Change'}</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div>
                    <label style={labelStyle}>{zh ? '生效日期' : 'Effective Date'}</label>
                    <input style={inputStyle} type="date" value={ruleForm.effective_date} onChange={e => setRuleForm({ ...ruleForm, effective_date: e.target.value })} />
                  </div>
                  <div>
                    <label style={labelStyle}>{zh ? '規則類型' : 'Rule Type'}</label>
                    <select style={inputStyle} value={ruleForm.rule_type} onChange={e => setRuleForm({ ...ruleForm, rule_type: e.target.value })}>
                      <option value="labor">{zh ? '勞保' : 'Labor Insurance'}</option>
                      <option value="health">{zh ? '健保' : 'Health Insurance'}</option>
                      <option value="pension">{zh ? '勞退' : 'Pension'}</option>
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>{zh ? '說明' : 'Description'}</label>
                    <input style={inputStyle} value={ruleForm.description} onChange={e => setRuleForm({ ...ruleForm, description: e.target.value })}
                      placeholder={zh ? '例：普通事故保險費率調整' : 'e.g., Rate adjustment'} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div>
                      <label style={labelStyle}>{zh ? '舊值' : 'Old Value'}</label>
                      <input style={inputStyle} value={ruleForm.old_value} onChange={e => setRuleForm({ ...ruleForm, old_value: e.target.value })} placeholder="e.g., 11.5%" />
                    </div>
                    <div>
                      <label style={labelStyle}>{zh ? '新值' : 'New Value'}</label>
                      <input style={inputStyle} value={ruleForm.new_value} onChange={e => setRuleForm({ ...ruleForm, new_value: e.target.value })} placeholder="e.g., 12.0%" />
                    </div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                    <button className="btn btn-ghost" onClick={() => setShowRuleForm(false)}>{zh ? '取消' : 'Cancel'}</button>
                    <button className="btn btn-primary" onClick={saveRule} disabled={ruleSaving}>
                      {ruleSaving ? (zh ? '儲存中...' : 'Saving...') : (zh ? '儲存' : 'Save')}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Rule History Table */}
          {ruleLoading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>Loading...</div>
          ) : ruleHistory.length === 0 ? (
            <div className="card" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
              {zh ? '尚無保險規則歷程紀錄' : 'No insurance rule history yet'}
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{zh ? '生效日期' : 'Effective Date'}</th>
                    <th>{zh ? '類型' : 'Type'}</th>
                    <th>{zh ? '說明' : 'Description'}</th>
                    <th>{zh ? '舊值' : 'Old Value'}</th>
                    <th>{zh ? '新值' : 'New Value'}</th>
                    <th>{zh ? '變更人' : 'Changed By'}</th>
                  </tr>
                </thead>
                <tbody>
                  {ruleHistory.map(r => (
                    <tr key={r.id}>
                      <td style={{ fontFamily: 'monospace', fontSize: '12px' }}>{r.effective_date}</td>
                      <td>
                        <span style={{
                          padding: '2px 8px', borderRadius: '10px', fontSize: '11px',
                          background: r.rule_type === 'labor' ? '#dbeafe' : r.rule_type === 'health' ? '#dcfce7' : '#fef3c7',
                          color: r.rule_type === 'labor' ? '#1d4ed8' : r.rule_type === 'health' ? '#15803d' : '#92400e',
                        }}>
                          {r.rule_type === 'labor' ? (zh ? '勞保' : 'Labor') : r.rule_type === 'health' ? (zh ? '健保' : 'Health') : (zh ? '勞退' : 'Pension')}
                        </span>
                      </td>
                      <td>{r.description}</td>
                      <td style={{ fontFamily: 'monospace', fontSize: '12px' }}>{r.old_value || '—'}</td>
                      <td style={{ fontFamily: 'monospace', fontSize: '12px' }}>{r.new_value || '—'}</td>
                      <td>{r.changed_by || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* Tab 3: Employee & Dependent Insurance                                */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {tab === 'employees' && (
        <div>
          {/* Employee Insurance Section */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 600 }}>{zh ? '員工投保資料' : 'Employee Insurance Records'}</h3>
            <button className="btn btn-primary" onClick={() => openEmpForm()}>+ {zh ? '新增投保' : 'Add Record'}</button>
          </div>

          {/* Employee Form Modal */}
          {showEmpForm && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
              onClick={() => setShowEmpForm(false)}>
              <div className="card" style={{ padding: '24px', width: '480px', maxWidth: '95vw' }} onClick={e => e.stopPropagation()}>
                <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>
                  {editingEmp ? (zh ? '編輯員工投保' : 'Edit Employee Insurance') : (zh ? '新增員工投保' : 'Add Employee Insurance')}
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div>
                    <label style={labelStyle}>{zh ? '員工' : 'Employee'}</label>
                    <select style={inputStyle} value={empForm.user_id} onChange={e => setEmpForm({ ...empForm, user_id: e.target.value })}>
                      <option value="">{zh ? '請選擇' : 'Select...'}</option>
                      {orgUsers.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </select>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div>
                      <label style={labelStyle}>{zh ? '勞保投保級距' : 'Labor Ins. Grade'}</label>
                      <input style={inputStyle} type="number" value={empForm.labor_ins_grade} onChange={e => setEmpForm({ ...empForm, labor_ins_grade: e.target.value })}
                        placeholder="e.g., 27600" />
                    </div>
                    <div>
                      <label style={labelStyle}>{zh ? '健保投保級距' : 'Health Ins. Grade'}</label>
                      <input style={inputStyle} type="number" value={empForm.health_ins_grade} onChange={e => setEmpForm({ ...empForm, health_ins_grade: e.target.value })}
                        placeholder="e.g., 27600" />
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div>
                      <label style={labelStyle}>{zh ? '勞退提繳率 (%)' : 'Pension Rate (%)'}</label>
                      <input style={inputStyle} type="number" step="0.1" min="0" max="6" value={empForm.pension_rate} onChange={e => setEmpForm({ ...empForm, pension_rate: e.target.value })} />
                    </div>
                    <div>
                      <label style={labelStyle}>{zh ? '加保日期' : 'Enrollment Date'}</label>
                      <input style={inputStyle} type="date" value={empForm.enrollment_date} onChange={e => setEmpForm({ ...empForm, enrollment_date: e.target.value })} />
                    </div>
                  </div>
                  <div>
                    <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                      <input type="checkbox" checked={empForm.is_enrolled} onChange={e => setEmpForm({ ...empForm, is_enrolled: e.target.checked })} />
                      {zh ? '目前在保中' : 'Currently Enrolled'}
                    </label>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                    <button className="btn btn-ghost" onClick={() => setShowEmpForm(false)}>{zh ? '取消' : 'Cancel'}</button>
                    <button className="btn btn-primary" onClick={saveEmpInsurance} disabled={empSaving}>
                      {empSaving ? (zh ? '儲存中...' : 'Saving...') : (zh ? '儲存' : 'Save')}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {empLoading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>Loading...</div>
          ) : empInsurance.length === 0 ? (
            <div className="card" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
              {zh ? '尚無員工投保資料' : 'No employee insurance records yet'}
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{zh ? '員工' : 'Employee'}</th>
                    <th style={{ textAlign: 'right' }}>{zh ? '勞保級距' : 'Labor Grade'}</th>
                    <th style={{ textAlign: 'right' }}>{zh ? '健保級距' : 'Health Grade'}</th>
                    <th style={{ textAlign: 'right' }}>{zh ? '勞退率' : 'Pension %'}</th>
                    <th>{zh ? '加保日' : 'Enrolled'}</th>
                    <th>{zh ? '狀態' : 'Status'}</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {empInsurance.map(ei => (
                    <tr key={ei.id} style={{ background: selectedEmpInsId === ei.id ? 'var(--bg-hover)' : undefined, cursor: 'pointer' }}
                      onClick={() => setSelectedEmpInsId(selectedEmpInsId === ei.id ? null : ei.id)}>
                      <td style={{ fontWeight: 500 }}>{ei.users?.name || getUserName(ei.user_id)}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: '12px' }}>{ei.labor_ins_grade?.toLocaleString() || '—'}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: '12px' }}>{ei.health_ins_grade?.toLocaleString() || '—'}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: '12px' }}>{ei.pension_rate != null ? `${ei.pension_rate}%` : '—'}</td>
                      <td style={{ fontFamily: 'monospace', fontSize: '12px' }}>{ei.enrollment_date || '—'}</td>
                      <td>
                        <span style={{
                          padding: '2px 8px', borderRadius: '10px', fontSize: '11px',
                          background: ei.is_enrolled ? '#dcfce7' : '#fee2e2',
                          color: ei.is_enrolled ? '#15803d' : '#b91c1c',
                        }}>
                          {ei.is_enrolled ? (zh ? '在保' : 'Active') : (zh ? '退保' : 'Withdrawn')}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '4px' }} onClick={e => e.stopPropagation()}>
                          <button className="btn btn-ghost" style={{ fontSize: '12px', padding: '4px 8px' }} onClick={() => openEmpForm(ei)}>
                            {zh ? '編輯' : 'Edit'}
                          </button>
                          <button className="btn btn-ghost" style={{ fontSize: '12px', padding: '4px 8px', color: '#b91c1c' }} onClick={() => deleteEmpInsurance(ei.id)}>
                            {zh ? '刪除' : 'Delete'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Dependents Section */}
          {selectedEmpInsId && (
            <div style={{ marginTop: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: 600 }}>
                  👨‍👩‍👧‍👦 {zh ? '眷屬資料' : 'Dependents'} — {empInsurance.find(e => e.id === selectedEmpInsId)?.users?.name || ''}
                </h3>
                <button className="btn btn-primary" onClick={() => openDepForm()}>+ {zh ? '新增眷屬' : 'Add Dependent'}</button>
              </div>

              {/* Dependent Form Modal */}
              {showDepForm && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
                  onClick={() => setShowDepForm(false)}>
                  <div className="card" style={{ padding: '24px', width: '480px', maxWidth: '95vw' }} onClick={e => e.stopPropagation()}>
                    <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>
                      {editingDep ? (zh ? '編輯眷屬' : 'Edit Dependent') : (zh ? '新增眷屬' : 'Add Dependent')}
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      <div>
                        <label style={labelStyle}>{zh ? '姓名' : 'Name'}</label>
                        <input style={inputStyle} value={depForm.dependent_name} onChange={e => setDepForm({ ...depForm, dependent_name: e.target.value })} />
                      </div>
                      <div>
                        <label style={labelStyle}>{zh ? '關係' : 'Relationship'}</label>
                        <select style={inputStyle} value={depForm.relationship} onChange={e => setDepForm({ ...depForm, relationship: e.target.value })}>
                          {RELATIONSHIPS.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                        <div>
                          <label style={labelStyle}>{zh ? '出生日期' : 'Birth Date'}</label>
                          <input style={inputStyle} type="date" value={depForm.birth_date} onChange={e => setDepForm({ ...depForm, birth_date: e.target.value })} />
                        </div>
                        <div>
                          <label style={labelStyle}>{zh ? '身分證字號' : 'ID Number'}</label>
                          <input style={inputStyle} value={depForm.id_number} onChange={e => setDepForm({ ...depForm, id_number: e.target.value })}
                            placeholder="A123456789" />
                        </div>
                      </div>
                      <div>
                        <label style={labelStyle}>{zh ? '加保日期' : 'Enrollment Date'}</label>
                        <input style={inputStyle} type="date" value={depForm.enrollment_date} onChange={e => setDepForm({ ...depForm, enrollment_date: e.target.value })} />
                      </div>
                      <div>
                        <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                          <input type="checkbox" checked={depForm.health_ins_enrolled} onChange={e => setDepForm({ ...depForm, health_ins_enrolled: e.target.checked })} />
                          {zh ? '健保加保' : 'Health Insurance Enrolled'}
                        </label>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                        <button className="btn btn-ghost" onClick={() => setShowDepForm(false)}>{zh ? '取消' : 'Cancel'}</button>
                        <button className="btn btn-primary" onClick={saveDependent} disabled={depSaving}>
                          {depSaving ? (zh ? '儲存中...' : 'Saving...') : (zh ? '儲存' : 'Save')}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {depLoading ? (
                <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-secondary)' }}>Loading...</div>
              ) : dependents.length === 0 ? (
                <div className="card" style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  {zh ? '尚無眷屬資料' : 'No dependents yet'}
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>{zh ? '姓名' : 'Name'}</th>
                        <th>{zh ? '關係' : 'Relationship'}</th>
                        <th>{zh ? '出生日期' : 'Birth Date'}</th>
                        <th>{zh ? '身分證字號' : 'ID Number'}</th>
                        <th>{zh ? '健保' : 'Health Ins.'}</th>
                        <th>{zh ? '加保日' : 'Enrolled'}</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {dependents.map(d => (
                        <tr key={d.id}>
                          <td style={{ fontWeight: 500 }}>{d.dependent_name}</td>
                          <td>{d.relationship}</td>
                          <td style={{ fontFamily: 'monospace', fontSize: '12px' }}>{d.birth_date || '—'}</td>
                          <td style={{ fontFamily: 'monospace', fontSize: '12px' }}>{maskId(d.id_number)}</td>
                          <td>
                            <span style={{
                              padding: '2px 8px', borderRadius: '10px', fontSize: '11px',
                              background: d.health_ins_enrolled ? '#dcfce7' : '#f3f4f6',
                              color: d.health_ins_enrolled ? '#15803d' : '#6b7280',
                            }}>
                              {d.health_ins_enrolled ? (zh ? '已加保' : 'Enrolled') : (zh ? '未加保' : 'Not Enrolled')}
                            </span>
                          </td>
                          <td style={{ fontFamily: 'monospace', fontSize: '12px' }}>{d.enrollment_date || '—'}</td>
                          <td>
                            <div style={{ display: 'flex', gap: '4px' }}>
                              <button className="btn btn-ghost" style={{ fontSize: '12px', padding: '4px 8px' }} onClick={() => openDepForm(d)}>
                                {zh ? '編輯' : 'Edit'}
                              </button>
                              <button className="btn btn-ghost" style={{ fontSize: '12px', padding: '4px 8px', color: '#b91c1c' }} onClick={() => deleteDependent(d.id)}>
                                {zh ? '刪除' : 'Delete'}
                              </button>
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
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* Tab 4: Insurance Change Records                                      */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {tab === 'changes' && (
        <div>
          {/* Filters */}
          <div className="card" style={{ padding: '16px', marginBottom: '16px', display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div>
              <label style={labelStyle}>{zh ? '異動類型' : 'Change Type'}</label>
              <select style={inputStyle} value={changeTypeFilter} onChange={e => setChangeTypeFilter(e.target.value)}>
                <option value="all">{zh ? '全部' : 'All'}</option>
                {CHANGE_TYPES.map(ct => <option key={ct} value={ct}>{ct}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>{zh ? '員工' : 'Employee'}</label>
              <select style={inputStyle} value={changeEmpFilter} onChange={e => setChangeEmpFilter(e.target.value)}>
                <option value="">{zh ? '全部' : 'All'}</option>
                {orgUsers.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>{zh ? '起始日期' : 'From'}</label>
              <input style={inputStyle} type="date" value={changeDateFrom} onChange={e => setChangeDateFrom(e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>{zh ? '結束日期' : 'To'}</label>
              <input style={inputStyle} type="date" value={changeDateTo} onChange={e => setChangeDateTo(e.target.value)} />
            </div>
            <button className="btn btn-primary" onClick={() => setShowChangeForm(true)}>
              + {zh ? '新增異動' : 'Add Change'}
            </button>
          </div>

          {/* Change Form Modal */}
          {showChangeForm && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
              onClick={() => setShowChangeForm(false)}>
              <div className="card" style={{ padding: '24px', width: '520px', maxWidth: '95vw' }} onClick={e => e.stopPropagation()}>
                <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>{zh ? '新增保險異動紀錄' : 'Add Insurance Change Record'}</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div>
                    <label style={labelStyle}>{zh ? '員工' : 'Employee'}</label>
                    <select style={inputStyle} value={changeForm.user_id} onChange={e => setChangeForm({ ...changeForm, user_id: e.target.value })}>
                      <option value="">{zh ? '請選擇' : 'Select...'}</option>
                      {orgUsers.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </select>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div>
                      <label style={labelStyle}>{zh ? '異動日期' : 'Change Date'}</label>
                      <input style={inputStyle} type="date" value={changeForm.change_date} onChange={e => setChangeForm({ ...changeForm, change_date: e.target.value })} />
                    </div>
                    <div>
                      <label style={labelStyle}>{zh ? '異動類型' : 'Change Type'}</label>
                      <select style={inputStyle} value={changeForm.change_type} onChange={e => setChangeForm({ ...changeForm, change_type: e.target.value })}>
                        {CHANGE_TYPES.map(ct => <option key={ct} value={ct}>{ct}</option>)}
                      </select>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div>
                      <label style={labelStyle}>{zh ? '舊值' : 'Old Value'}</label>
                      <input style={inputStyle} value={changeForm.old_value} onChange={e => setChangeForm({ ...changeForm, old_value: e.target.value })} />
                    </div>
                    <div>
                      <label style={labelStyle}>{zh ? '新值' : 'New Value'}</label>
                      <input style={inputStyle} value={changeForm.new_value} onChange={e => setChangeForm({ ...changeForm, new_value: e.target.value })} />
                    </div>
                  </div>
                  <div>
                    <label style={labelStyle}>{zh ? '狀態' : 'Status'}</label>
                    <select style={inputStyle} value={changeForm.status} onChange={e => setChangeForm({ ...changeForm, status: e.target.value })}>
                      {Object.entries(CHANGE_STATUSES).map(([k, v]) => (
                        <option key={k} value={k}>{zh ? v.label : v.labelEn}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>{zh ? '備註' : 'Notes'}</label>
                    <input style={inputStyle} value={changeForm.notes} onChange={e => setChangeForm({ ...changeForm, notes: e.target.value })} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                    <button className="btn btn-ghost" onClick={() => setShowChangeForm(false)}>{zh ? '取消' : 'Cancel'}</button>
                    <button className="btn btn-primary" onClick={saveChange} disabled={changeSaving}>
                      {changeSaving ? (zh ? '儲存中...' : 'Saving...') : (zh ? '儲存' : 'Save')}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Changes Table */}
          {changeLoading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>Loading...</div>
          ) : changes.length === 0 ? (
            <div className="card" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
              {zh ? '尚無保險異動紀錄' : 'No insurance change records yet'}
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{zh ? '日期' : 'Date'}</th>
                    <th>{zh ? '員工' : 'Employee'}</th>
                    <th>{zh ? '異動類型' : 'Type'}</th>
                    <th>{zh ? '舊值' : 'Old Value'}</th>
                    <th>{zh ? '新值' : 'New Value'}</th>
                    <th>{zh ? '狀態' : 'Status'}</th>
                    <th>{zh ? '備註' : 'Notes'}</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {changes.map(c => {
                    const st = CHANGE_STATUSES[c.status] || CHANGE_STATUSES['pending'];
                    return (
                      <tr key={c.id}>
                        <td style={{ fontFamily: 'monospace', fontSize: '12px' }}>{c.change_date}</td>
                        <td style={{ fontWeight: 500 }}>{c.users?.name || getUserName(c.user_id)}</td>
                        <td>
                          <span style={{
                            padding: '2px 8px', borderRadius: '10px', fontSize: '11px',
                            background: c.change_type === '加保' ? '#dcfce7' : c.change_type === '退保' ? '#fee2e2' : c.change_type === '薪調' ? '#dbeafe' : '#fef3c7',
                            color: c.change_type === '加保' ? '#15803d' : c.change_type === '退保' ? '#b91c1c' : c.change_type === '薪調' ? '#1d4ed8' : '#92400e',
                          }}>
                            {c.change_type}
                          </span>
                        </td>
                        <td style={{ fontFamily: 'monospace', fontSize: '12px' }}>{c.old_value || '—'}</td>
                        <td style={{ fontFamily: 'monospace', fontSize: '12px' }}>{c.new_value || '—'}</td>
                        <td>
                          <span style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '11px', background: st.bg, color: st.color }}>
                            {zh ? st.label : st.labelEn}
                          </span>
                        </td>
                        <td style={{ fontSize: '12px', maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.notes || '—'}</td>
                        <td>
                          {c.status === 'pending' && (
                            <button className="btn btn-ghost" style={{ fontSize: '12px', padding: '4px 8px' }}
                              onClick={() => updateChangeStatus(c.id, 'submitted')}>
                              {zh ? '申報' : 'Submit'}
                            </button>
                          )}
                          {c.status === 'submitted' && (
                            <button className="btn btn-ghost" style={{ fontSize: '12px', padding: '4px 8px' }}
                              onClick={() => updateChangeStatus(c.id, 'completed')}>
                              {zh ? '完成' : 'Complete'}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* Tab 5: Insurance Deduction Comparison                                */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {tab === 'comparison' && (
        <div>
          <div className="card" style={{ padding: '20px', marginBottom: '16px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '12px' }}>
              {zh ? '上傳實際扣繳資料 (CSV)' : 'Upload Actual Deductions (CSV)'}
            </h3>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
              {zh
                ? 'CSV 格式：員工姓名, 實際勞保扣繳, 實際健保扣繳, 實際勞退扣繳'
                : 'CSV format: employee_name, actual_labor_ins, actual_health_ins, actual_pension'}
            </p>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              <input type="file" accept=".csv" onChange={handleCSVUpload}
                style={{ fontSize: '13px' }} />
              {comparisonData.length > 0 && (
                <button className="btn btn-ghost" onClick={() => setComparisonData([])}>
                  {zh ? '清除' : 'Clear'}
                </button>
              )}
            </div>
          </div>

          {comparisonLoading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>Loading...</div>
          ) : comparisonData.length === 0 ? (
            <div className="card" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
              {zh ? '請上傳 CSV 檔案以進行比對' : 'Upload a CSV file to compare deductions'}
            </div>
          ) : (
            <>
              <div style={{ overflowX: 'auto' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>{zh ? '員工' : 'Employee'}</th>
                      <th style={{ textAlign: 'right' }}>{zh ? '計算勞保' : 'Calc Labor'}</th>
                      <th style={{ textAlign: 'right' }}>{zh ? '實際勞保' : 'Actual Labor'}</th>
                      <th style={{ textAlign: 'right' }}>{zh ? '勞保差異' : 'Labor Diff'}</th>
                      <th style={{ textAlign: 'right' }}>{zh ? '計算健保' : 'Calc Health'}</th>
                      <th style={{ textAlign: 'right' }}>{zh ? '實際健保' : 'Actual Health'}</th>
                      <th style={{ textAlign: 'right' }}>{zh ? '健保差異' : 'Health Diff'}</th>
                      <th style={{ textAlign: 'right' }}>{zh ? '計算勞退' : 'Calc Pension'}</th>
                      <th style={{ textAlign: 'right' }}>{zh ? '實際勞退' : 'Actual Pension'}</th>
                      <th style={{ textAlign: 'right' }}>{zh ? '勞退差異' : 'Pension Diff'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comparisonData.map((row, i) => {
                      const hasDiff = row.labor_diff !== 0 || row.health_diff !== 0 || row.pension_diff !== 0;
                      return (
                        <tr key={i} style={{ background: hasDiff ? '#fef2f2' : undefined }}>
                          <td style={{ fontWeight: 500 }}>{row.employee}</td>
                          <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: '12px' }}>{row.calculated_labor_ins.toLocaleString()}</td>
                          <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: '12px' }}>{row.actual_labor_ins.toLocaleString()}</td>
                          <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: '12px', fontWeight: row.labor_diff !== 0 ? 700 : 400, color: row.labor_diff !== 0 ? '#b91c1c' : 'inherit' }}>
                            {row.labor_diff !== 0 ? (row.labor_diff > 0 ? '+' : '') + row.labor_diff.toLocaleString() : '—'}
                          </td>
                          <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: '12px' }}>{row.calculated_health_ins.toLocaleString()}</td>
                          <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: '12px' }}>{row.actual_health_ins.toLocaleString()}</td>
                          <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: '12px', fontWeight: row.health_diff !== 0 ? 700 : 400, color: row.health_diff !== 0 ? '#b91c1c' : 'inherit' }}>
                            {row.health_diff !== 0 ? (row.health_diff > 0 ? '+' : '') + row.health_diff.toLocaleString() : '—'}
                          </td>
                          <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: '12px' }}>{row.calculated_pension.toLocaleString()}</td>
                          <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: '12px' }}>{row.actual_pension.toLocaleString()}</td>
                          <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: '12px', fontWeight: row.pension_diff !== 0 ? 700 : 400, color: row.pension_diff !== 0 ? '#b91c1c' : 'inherit' }}>
                            {row.pension_diff !== 0 ? (row.pension_diff > 0 ? '+' : '') + row.pension_diff.toLocaleString() : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Summary Totals */}
              <div className="card" style={{ padding: '16px', marginTop: '16px' }}>
                <h4 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px' }}>{zh ? '合計' : 'Summary Totals'}</h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '16px' }}>
                  {(() => {
                    const totals = comparisonData.reduce((acc, r) => ({
                      calcLabor: acc.calcLabor + r.calculated_labor_ins,
                      actLabor: acc.actLabor + r.actual_labor_ins,
                      diffLabor: acc.diffLabor + r.labor_diff,
                      calcHealth: acc.calcHealth + r.calculated_health_ins,
                      actHealth: acc.actHealth + r.actual_health_ins,
                      diffHealth: acc.diffHealth + r.health_diff,
                      calcPension: acc.calcPension + r.calculated_pension,
                      actPension: acc.actPension + r.actual_pension,
                      diffPension: acc.diffPension + r.pension_diff,
                    }), { calcLabor: 0, actLabor: 0, diffLabor: 0, calcHealth: 0, actHealth: 0, diffHealth: 0, calcPension: 0, actPension: 0, diffPension: 0 });
                    const diffRows = comparisonData.filter(r => r.labor_diff !== 0 || r.health_diff !== 0 || r.pension_diff !== 0).length;
                    return (
                      <>
                        <div>
                          <span className="detail-label">{zh ? '勞保差異合計' : 'Labor Ins. Diff Total'}</span>
                          <div style={{ fontSize: '18px', fontWeight: 700, color: totals.diffLabor !== 0 ? '#b91c1c' : '#15803d', fontFamily: 'monospace' }}>
                            {totals.diffLabor !== 0 ? (totals.diffLabor > 0 ? '+' : '') + totals.diffLabor.toLocaleString() : '0'}
                          </div>
                        </div>
                        <div>
                          <span className="detail-label">{zh ? '健保差異合計' : 'Health Ins. Diff Total'}</span>
                          <div style={{ fontSize: '18px', fontWeight: 700, color: totals.diffHealth !== 0 ? '#b91c1c' : '#15803d', fontFamily: 'monospace' }}>
                            {totals.diffHealth !== 0 ? (totals.diffHealth > 0 ? '+' : '') + totals.diffHealth.toLocaleString() : '0'}
                          </div>
                        </div>
                        <div>
                          <span className="detail-label">{zh ? '勞退差異合計' : 'Pension Diff Total'}</span>
                          <div style={{ fontSize: '18px', fontWeight: 700, color: totals.diffPension !== 0 ? '#b91c1c' : '#15803d', fontFamily: 'monospace' }}>
                            {totals.diffPension !== 0 ? (totals.diffPension > 0 ? '+' : '') + totals.diffPension.toLocaleString() : '0'}
                          </div>
                        </div>
                        <div>
                          <span className="detail-label">{zh ? '有差異筆數' : 'Rows with Differences'}</span>
                          <div style={{ fontSize: '18px', fontWeight: 700, color: diffRows > 0 ? '#b91c1c' : '#15803d' }}>
                            {diffRows} / {comparisonData.length}
                          </div>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
