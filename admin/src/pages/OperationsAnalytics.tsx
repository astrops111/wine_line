import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { getLocale } from '../lib/i18n';
import { useOrg } from '../lib/OrgContext';

interface MonthlyCost {
  month: string;
  totalPayroll: number;
  overtimeCost: number;
  headcount: number;
}

interface WorkflowRate {
  name: string;
  total: number;
  completed: number;
  running: number;
}

interface StoreMetric {
  store_id: string;
  store_name: string;
  headcount: number;
  avgHours: number;
  taskCompletion: number;
  lateRate: number;
}

export function OperationsAnalytics() {
  const zh = getLocale() === 'zh-TW';
  const { orgId } = useOrg();
  const [tab, setTab] = useState<'overview' | 'labor' | 'workflows' | 'stores'>('overview');
  const [loading, setLoading] = useState(true);

  // Overview KPIs
  const [activeEmployees, setActiveEmployees] = useState(0);
  const [monthlyPayroll, setMonthlyPayroll] = useState(0);
  const [workflowCompletionRate, setWorkflowCompletionRate] = useState(0);
  const [avgAttendanceRate, setAvgAttendanceRate] = useState(0);
  const [openTasks, setOpenTasks] = useState(0);
  const [overtimeHours, setOvertimeHours] = useState(0);

  // Labor tab
  const [monthlyCosts, setMonthlyCosts] = useState<MonthlyCost[]>([]);

  // Workflow tab
  const [workflowRates, setWorkflowRates] = useState<WorkflowRate[]>([]);

  // Store tab
  const [storeMetrics, setStoreMetrics] = useState<StoreMetric[]>([]);

  useEffect(() => {
    if (!orgId) return;
    loadOverview();
  }, [orgId]);

  useEffect(() => {
    if (!orgId) return;
    if (tab === 'labor') loadLaborCosts();
    if (tab === 'workflows') loadWorkflowRates();
    if (tab === 'stores') loadStoreMetrics();
  }, [tab, orgId]);

  async function loadOverview() {
    setLoading(true);
    const now = new Date();
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const lastMonth = `${now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()}-${String(now.getMonth() === 0 ? 12 : now.getMonth()).padStart(2, '0')}`;

    const [usersRes, payrollRes, wfRes, tasksRes, timeRes, otRes] = await Promise.all([
      supabase.from('users').select('id', { count: 'exact', head: true }).eq('status', 'active'),
      supabase.from('payroll_runs').select('total_net_pay').eq('organization_id', orgId).eq('pay_period', lastMonth).limit(1),
      supabase.from('workflow_instances').select('status').eq('organization_id', orgId),
      supabase.from('tasks').select('status').eq('organization_id', orgId).in('status', ['pending', 'in_progress']),
      supabase.from('time_records').select('is_late').gte('clock_in', `${monthStart}T00:00:00+08:00`),
      supabase.from('overtime_records').select('hours').gte('date', monthStart).eq('status', 'approved'),
    ]);

    setActiveEmployees(usersRes.count || 0);
    setMonthlyPayroll(payrollRes.data?.[0]?.total_net_pay || 0);

    const wfData = wfRes.data || [];
    const totalWf = wfData.length;
    const completedWf = wfData.filter((w: any) => w.status === 'completed').length;
    setWorkflowCompletionRate(totalWf > 0 ? Math.round((completedWf / totalWf) * 100) : 0);

    setOpenTasks(tasksRes.count || 0);

    const timeData = timeRes.data || [];
    const lateCount = timeData.filter((r: any) => r.is_late).length;
    setAvgAttendanceRate(timeData.length > 0 ? Math.round(((timeData.length - lateCount) / timeData.length) * 100) : 100);

    const totalOT = (otRes.data || []).reduce((sum: number, r: any) => sum + (r.hours || 0), 0);
    setOvertimeHours(totalOT);

    setLoading(false);
  }

  async function loadLaborCosts() {
    setLoading(true);
    const months: MonthlyCost[] = [];
    const now = new Date();

    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const period = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      const endStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(monthEnd.getDate()).padStart(2, '0')}`;

      const [payRes, otRes, hcRes] = await Promise.all([
        supabase.from('payroll_runs').select('total_net_pay').eq('organization_id', orgId).eq('pay_period', period).limit(1),
        supabase.from('overtime_records').select('hours').gte('date', `${period}-01`).lte('date', endStr).eq('status', 'approved'),
        supabase.from('users').select('id', { count: 'exact', head: true }).eq('status', 'active'),
      ]);

      const otCost = (otRes.data || []).reduce((s: number, r: any) => s + (r.hours || 0) * 200, 0);

      months.push({
        month: period,
        totalPayroll: payRes.data?.[0]?.total_net_pay || 0,
        overtimeCost: otCost,
        headcount: hcRes.count || 0,
      });
    }
    setMonthlyCosts(months);
    setLoading(false);
  }

  async function loadWorkflowRates() {
    setLoading(true);
    const { data: workflows } = await supabase
      .from('workflows')
      .select('id, name')
      .eq('organization_id', orgId);

    if (!workflows) { setWorkflowRates([]); setLoading(false); return; }

    const { data: instances } = await supabase
      .from('workflow_instances')
      .select('workflow_id, status')
      .eq('organization_id', orgId);

    const rates: WorkflowRate[] = workflows.map(wf => {
      const wfInstances = (instances || []).filter((i: any) => i.workflow_id === wf.id);
      return {
        name: wf.name,
        total: wfInstances.length,
        completed: wfInstances.filter((i: any) => i.status === 'completed').length,
        running: wfInstances.filter((i: any) => i.status === 'running').length,
      };
    });
    setWorkflowRates(rates);
    setLoading(false);
  }

  async function loadStoreMetrics() {
    setLoading(true);
    const { data: storesData } = await supabase.from('stores').select('id, name').eq('is_active', true);
    if (!storesData) { setStoreMetrics([]); setLoading(false); return; }

    const monthStart = (() => { const d = new Date(); d.setDate(1); return d.toISOString().split('T')[0]; })();

    const [usersRes, timeRes, tasksRes] = await Promise.all([
      supabase.from('users').select('id, store_id').eq('status', 'active'),
      supabase.from('time_records').select('user_id, total_hours, is_late, store_id').gte('clock_in', `${monthStart}T00:00:00+08:00`),
      supabase.from('tasks').select('status, metadata').eq('organization_id', orgId),
    ]);

    const users = usersRes.data || [];
    const times = timeRes.data || [];
    const tasks = tasksRes.data || [];

    const metrics: StoreMetric[] = storesData.map(store => {
      const storeUsers = users.filter((u: any) => u.store_id === store.id);
      const storeTime = times.filter((t: any) => t.store_id === store.id);
      const lateCount = storeTime.filter((t: any) => t.is_late).length;
      const avgHrs = storeTime.length > 0
        ? storeTime.reduce((s: number, t: any) => s + (t.total_hours || 0), 0) / Math.max(storeUsers.length, 1)
        : 0;

      return {
        store_id: store.id,
        store_name: store.name,
        headcount: storeUsers.length,
        avgHours: Math.round(avgHrs * 10) / 10,
        taskCompletion: 0,
        lateRate: storeTime.length > 0 ? Math.round((lateCount / storeTime.length) * 100) : 0,
      };
    });
    setStoreMetrics(metrics);
    setLoading(false);
  }

  const tabs: { key: typeof tab; label: string; icon: string }[] = [
    { key: 'overview',  label: zh ? '總覽' : 'Overview',       icon: '📊' },
    { key: 'labor',     label: zh ? '勞動成本' : 'Labor Cost',  icon: '💰' },
    { key: 'workflows', label: zh ? '工作流程' : 'Workflows',   icon: '🔄' },
    { key: 'stores',    label: zh ? '門市比較' : 'Store Compare', icon: '🏪' },
  ];

  const kpiCard = (icon: string, label: string, value: string | number, sub?: string) => (
    <div className="card" style={{ padding: '20px', textAlign: 'center', flex: '1 1 160px', minWidth: '160px' }}>
      <div style={{ fontSize: '28px', marginBottom: '8px' }}>{icon}</div>
      <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-primary)' }}>{value}</div>
      <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>{label}</div>
      {sub && <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>{sub}</div>}
    </div>
  );

  const barCell = (value: number, max: number, color: string) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <div style={{ flex: 1, height: '8px', borderRadius: '4px', background: 'var(--bg-secondary)' }}>
        <div style={{ width: `${max > 0 ? Math.min((value / max) * 100, 100) : 0}%`, height: '100%', borderRadius: '4px', background: color }} />
      </div>
      <span style={{ fontSize: '12px', minWidth: '40px', textAlign: 'right' }}>{value}</span>
    </div>
  );

  return (
    <div className="fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: 700 }}>
          {zh ? '📈 營運分析' : '📈 Operations Analytics'}
        </h2>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '20px', flexWrap: 'wrap' }}>
        {tabs.map(t => (
          <button
            key={t.key}
            className={`btn ${tab === t.key ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setTab(t.key)}
            style={{ fontSize: '13px' }}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {loading && <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>Loading...</div>}

      {/* ── Overview Tab ── */}
      {tab === 'overview' && !loading && (
        <div>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '20px' }}>
            {kpiCard('👥', zh ? '在職人數' : 'Active Staff', activeEmployees)}
            {kpiCard('💰', zh ? '上月薪資總額' : 'Last Month Payroll', monthlyPayroll > 0 ? `$${monthlyPayroll.toLocaleString()}` : '—')}
            {kpiCard('✅', zh ? '流程完成率' : 'Workflow Completion', `${workflowCompletionRate}%`)}
            {kpiCard('⏰', zh ? '準時出勤率' : 'On-Time Rate', `${avgAttendanceRate}%`)}
            {kpiCard('📋', zh ? '待辦任務' : 'Open Tasks', openTasks)}
            {kpiCard('🕐', zh ? '本月加班時數' : 'OT Hours (Month)', `${overtimeHours}h`)}
          </div>

          <div className="card" style={{ padding: '20px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '12px' }}>
              {zh ? '快速導覽' : 'Quick Navigation'}
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '8px' }}>
              {[
                { label: zh ? '查看薪資明細' : 'View Payroll', path: '/payroll', icon: '💰' },
                { label: zh ? '出勤報表' : 'Attendance Report', path: '/hr-dashboard', icon: '📊' },
                { label: zh ? '排班管理' : 'Scheduling', path: '/scheduling', icon: '📅' },
                { label: zh ? '流程管理' : 'Workflows', path: '/workflow-management', icon: '🔄' },
                { label: zh ? '庫存管理' : 'Inventory', path: '/inventory', icon: '📦' },
                { label: zh ? '供應商管理' : 'Vendors', path: '/vendors', icon: '🏭' },
              ].map(link => (
                <a key={link.path} href={link.path} className="card" style={{
                  padding: '12px', display: 'flex', alignItems: 'center', gap: '8px',
                  textDecoration: 'none', color: 'var(--text-primary)', fontSize: '13px',
                }}>
                  <span style={{ fontSize: '18px' }}>{link.icon}</span>
                  {link.label}
                </a>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Labor Cost Tab ── */}
      {tab === 'labor' && !loading && (
        <div className="card" style={{ padding: '20px' }}>
          <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '16px' }}>
            {zh ? '12 個月勞動成本趨勢' : '12-Month Labor Cost Trend'}
          </h3>
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>{zh ? '月份' : 'Month'}</th>
                  <th style={{ textAlign: 'right' }}>{zh ? '薪資總額' : 'Payroll'}</th>
                  <th style={{ textAlign: 'right' }}>{zh ? '加班費用' : 'OT Cost'}</th>
                  <th style={{ textAlign: 'right' }}>{zh ? '總成本' : 'Total'}</th>
                  <th style={{ textAlign: 'right' }}>{zh ? '人數' : 'HC'}</th>
                  <th style={{ textAlign: 'right' }}>{zh ? '人均成本' : 'Cost/HC'}</th>
                </tr>
              </thead>
              <tbody>
                {monthlyCosts.map(m => {
                  const total = m.totalPayroll + m.overtimeCost;
                  const perHC = m.headcount > 0 ? Math.round(total / m.headcount) : 0;
                  return (
                    <tr key={m.month}>
                      <td style={{ fontWeight: 500 }}>{m.month}</td>
                      <td style={{ textAlign: 'right' }}>{m.totalPayroll > 0 ? `$${m.totalPayroll.toLocaleString()}` : '—'}</td>
                      <td style={{ textAlign: 'right' }}>{m.overtimeCost > 0 ? `$${m.overtimeCost.toLocaleString()}` : '—'}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{total > 0 ? `$${total.toLocaleString()}` : '—'}</td>
                      <td style={{ textAlign: 'right' }}>{m.headcount}</td>
                      <td style={{ textAlign: 'right' }}>{perHC > 0 ? `$${perHC.toLocaleString()}` : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Workflows Tab ── */}
      {tab === 'workflows' && !loading && (
        <div className="card" style={{ padding: '20px' }}>
          <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '16px' }}>
            {zh ? '流程完成率' : 'Workflow Completion Rates'}
          </h3>
          {workflowRates.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>{zh ? '尚無流程資料' : 'No workflow data'}</p>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>{zh ? '流程名稱' : 'Workflow'}</th>
                  <th style={{ textAlign: 'right' }}>{zh ? '實例數' : 'Instances'}</th>
                  <th style={{ textAlign: 'right' }}>{zh ? '進行中' : 'Running'}</th>
                  <th style={{ textAlign: 'right' }}>{zh ? '已完成' : 'Completed'}</th>
                  <th style={{ width: '200px' }}>{zh ? '完成率' : 'Completion %'}</th>
                </tr>
              </thead>
              <tbody>
                {workflowRates.map(wf => {
                  const pct = wf.total > 0 ? Math.round((wf.completed / wf.total) * 100) : 0;
                  return (
                    <tr key={wf.name}>
                      <td style={{ fontWeight: 500 }}>{wf.name}</td>
                      <td style={{ textAlign: 'right' }}>{wf.total}</td>
                      <td style={{ textAlign: 'right' }}>{wf.running}</td>
                      <td style={{ textAlign: 'right' }}>{wf.completed}</td>
                      <td>{barCell(pct, 100, pct >= 80 ? '#22c55e' : pct >= 50 ? '#eab308' : '#ef4444')}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── Store Compare Tab ── */}
      {tab === 'stores' && !loading && (
        <div className="card" style={{ padding: '20px' }}>
          <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '16px' }}>
            {zh ? '門市營運比較（本月）' : 'Store Comparison (This Month)'}
          </h3>
          {storeMetrics.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>{zh ? '尚無門市資料' : 'No store data'}</p>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>{zh ? '門市' : 'Store'}</th>
                  <th style={{ textAlign: 'right' }}>{zh ? '人數' : 'HC'}</th>
                  <th style={{ textAlign: 'right' }}>{zh ? '人均工時' : 'Avg Hrs/Person'}</th>
                  <th style={{ textAlign: 'right' }}>{zh ? '遲到率' : 'Late %'}</th>
                </tr>
              </thead>
              <tbody>
                {storeMetrics.map(s => (
                  <tr key={s.store_id}>
                    <td style={{ fontWeight: 500 }}>{s.store_name}</td>
                    <td style={{ textAlign: 'right' }}>{s.headcount}</td>
                    <td style={{ textAlign: 'right' }}>{s.avgHours}h</td>
                    <td style={{ textAlign: 'right' }}>
                      <span style={{
                        padding: '2px 8px', borderRadius: '10px', fontSize: '12px',
                        background: s.lateRate > 15 ? '#fee2e2' : s.lateRate > 5 ? '#fef9c3' : '#dcfce7',
                        color: s.lateRate > 15 ? '#b91c1c' : s.lateRate > 5 ? '#a16207' : '#15803d',
                      }}>
                        {s.lateRate}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
