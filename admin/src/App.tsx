import { BrowserRouter, Routes, Route, NavLink, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { t, setLocale, getLocale, initLocale, type Locale } from './lib/i18n';
import { initTheme, getTheme, setTheme, type Theme } from './lib/theme';
import { OrgProvider, useOrg } from './lib/OrgContext';
import { canAccess, getModuleForPath } from './lib/permissions';
import { Dashboard } from './pages/Dashboard';
import { Tasks } from './pages/Tasks';
import { Workflows } from './pages/Workflows';
import { LineManagement } from './pages/LineManagement';
import { Checklists } from './pages/Checklists';
import { Notifications } from './pages/Notifications';
import { Triggers } from './pages/Triggers';
import { Users } from './pages/Users';
import { Employees } from './pages/Employees';
import { Holidays } from './pages/Holidays';
import { Scheduling } from './pages/Scheduling';
import { ShiftRules } from './pages/ShiftRules';
import { AdminSettings } from './pages/AdminSettings';
import { TimeTracker } from './pages/TimeTracker';
import { HrDashboard } from './pages/HrDashboard';
import { LiffApp } from './pages/LiffApp';
import { ManagerDashboard } from './pages/ManagerDashboard';
import { LiffManagerDashboard } from './pages/LiffManagerDashboard';
import { OrgManagement } from './pages/OrgManagement';
import { WorkflowManagement } from './pages/WorkflowManagement';
import { LeaveManagement } from './pages/LeaveManagement';
import { OvertimeRequests } from './pages/OvertimeRequests';
import { PayrollManagement } from './pages/PayrollManagement';
import { HelpCenter } from './pages/HelpCenter';
import { AgentConsole } from './pages/AgentConsole';
import { AuditLogs } from './pages/AuditLogs';
import { LineLogs } from './pages/LineLogs';
import { PerformanceManagement } from './pages/PerformanceManagement';
import { DocumentManagement } from './pages/DocumentManagement';
import { RecruitmentATS } from './pages/RecruitmentATS';
import { BusinessTrips } from './pages/BusinessTrips';
import { ExpenseClaims } from './pages/ExpenseClaims';
import { Onboarding } from './pages/Onboarding';
import { Announcements } from './pages/Announcements';
import { Training } from './pages/Training';
import { Disciplinary } from './pages/Disciplinary';
import { JobsManagement } from './pages/JobsManagement';
import { OperationsAnalytics } from './pages/OperationsAnalytics';
import { VendorManagement } from './pages/VendorManagement';
import { InventoryManagement } from './pages/InventoryManagement';
import './index.css';

initLocale();
initTheme();

// ── Permission Guard ──────────────────────────────────────────────────────────
// Reads current route, checks module_access config + user roles from OrgContext.
// Shows an inline card for disabled modules or insufficient role.
// Routes without a module_access row (e.g. /tasks, /workflows) pass through.
function PermissionGuard({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { userRoles, modules, loading } = useOrg();
  const zh = getLocale() === 'zh-TW';

  if (loading) return null;

  const mod = getModuleForPath(location.pathname, modules);
  if (!mod) return <>{children}</>;

  if (!mod.is_enabled) {
    return (
      <div className="fade-in" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div className="card" style={{ maxWidth: '420px', padding: '40px', textAlign: 'center' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>🚫</div>
          <h2 style={{ fontWeight: 600, marginBottom: '8px', color: 'var(--text-primary)' }}>
            {zh ? '此模組已停用' : 'Module Disabled'}
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '20px' }}>
            {zh
              ? `「${mod.module_name_zh}」模組目前已被管理員停用。`
              : `The "${mod.module_name_en}" module is currently disabled by your administrator.`}
          </p>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{mod.module_key}</div>
        </div>
      </div>
    );
  }

  if (!canAccess(mod.required_role, userRoles)) {
    return (
      <div className="fade-in" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div className="card" style={{ maxWidth: '420px', padding: '40px', textAlign: 'center' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>🔒</div>
          <h2 style={{ fontWeight: 600, marginBottom: '8px', color: 'var(--text-primary)' }}>
            {zh ? '權限不足' : 'Access Denied'}
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '20px' }}>
            {zh
              ? `您需要「${mod.required_role}」或以上角色才能存取此模組。`
              : `You need "${mod.required_role}" or higher role to access this module.`}
          </p>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', flexWrap: 'wrap' }}>
            {userRoles.map(r => (
              <span key={r} style={{
                padding: '3px 10px', borderRadius: '10px', fontSize: '11px',
                background: 'var(--accent-primary-dim)', color: 'var(--accent-primary)',
              }}>{r}</span>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

function Sidebar() {
  const [locale, setCurrentLocale] = useState<Locale>(getLocale());
  const [theme, setCurrentTheme] = useState<Theme>(getTheme());
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('sidebar-collapsed') === 'true');
  const location = useLocation();
  const { userRoles, modules } = useOrg();

  const toggleCollapse = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem('sidebar-collapsed', String(next));
  };

  const isAccessible = (moduleKey: string): boolean => {
    const mod = modules.find(m => m.module_key === moduleKey);
    if (!mod) return true;
    if (!mod.is_enabled) return false;
    return canAccess(mod.required_role, userRoles);
  };
  const isOrgPath = location.pathname === '/org-management';
  const isWfPath  = location.pathname === '/workflow-management';
  const hrPaths = ['/hr-dashboard', '/time-tracker', '/leave-management', '/overtime-requests', '/payroll', '/scheduling', '/holidays', '/shift-rules'];
  const opsPaths = ['/operations-analytics', '/vendors', '/inventory'];
  const [opsOpen, setOpsOpen] = useState(opsPaths.includes(location.pathname));
  const [orgOpen, setOrgOpen] = useState(isOrgPath);
  const [wfOpen,  setWfOpen]  = useState(isWfPath);
  const [hrOpen,  setHrOpen]  = useState(hrPaths.includes(location.pathname));

  const toggleLocale = () => {
    const next = locale === 'zh-TW' ? 'en' : 'zh-TW';
    setLocale(next);
    setCurrentLocale(next);
    window.location.reload();
  };

  const toggleTheme = () => {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    setCurrentTheme(next);
  };

  const zh = locale === 'zh-TW';

  const mainNavItems = [
    { path: '/', icon: '📊', label: t('nav.dashboard'), moduleKey: 'dashboard' },
    { path: '/manager-dashboard', icon: '🎯', label: zh ? '營運看板' : 'Ops Dashboard', moduleKey: 'manager-dashboard' },
  ].filter(item => isAccessible(item.moduleKey));

  const hrNavItems = [
    { path: '/hr-dashboard',      icon: '📊', label: zh ? 'HR 報表'  : 'HR Dashboard', moduleKey: 'hr-dashboard' },
    { path: '/time-tracker',      icon: '⏱',  label: zh ? '打卡追蹤' : 'Time Tracker',  moduleKey: 'time-tracker' },
    { path: '/leave-management',  icon: '🌴', label: zh ? '請假管理' : 'Leave Mgmt',    moduleKey: 'leave-management' },
    { path: '/overtime-requests', icon: '⏰', label: zh ? '加班申請' : 'Overtime',      moduleKey: 'overtime-requests' },
    { path: '/payroll',           icon: '💰', label: zh ? '薪資管理' : 'Payroll',       moduleKey: 'payroll' },
    { path: '/scheduling',        icon: '📅', label: zh ? '排班'     : 'Scheduling',    moduleKey: 'scheduling' },
    { path: '/holidays',          icon: '🗓', label: zh ? '假日管理' : 'Holidays',      moduleKey: 'holidays' },
    { path: '/shift-rules',       icon: '⚖️', label: zh ? '排班規則' : 'Shift Rules',   moduleKey: 'shift-rules' },
    { path: '/performance',       icon: '🎯', label: zh ? '績效管理' : 'Performance',    moduleKey: 'performance' },
    { path: '/recruitment',       icon: '🔍', label: zh ? '招募管理' : 'Recruitment',    moduleKey: 'recruitment' },
    { path: '/documents',         icon: '📁', label: zh ? '文件管理' : 'Documents',      moduleKey: 'documents' },
    { path: '/audit-logs',        icon: '📋', label: zh ? '稽核記錄' : 'Audit Logs',     moduleKey: 'audit-logs' },
    { path: '/business-trips',    icon: '✈️', label: zh ? '公出差旅' : 'Business Trips', moduleKey: 'business-trips' },
    { path: '/expense-claims',    icon: '🧾', label: zh ? '費用核銷' : 'Expense Claims', moduleKey: 'expense-claims' },
    { path: '/onboarding',        icon: '📋', label: zh ? '到職離職' : 'Onboarding',     moduleKey: 'onboarding' },
    { path: '/announcements',     icon: '📢', label: zh ? '公告管理' : 'Announcements',  moduleKey: 'announcements' },
    { path: '/training',          icon: '🎓', label: zh ? '教育訓練' : 'Training',       moduleKey: 'training' },
    { path: '/disciplinary',      icon: '⚖️', label: zh ? '獎懲紀錄' : 'Disciplinary',   moduleKey: 'disciplinary' },
  ].filter(item => isAccessible(item.moduleKey));

  const wfSubItems = [
    { tab: 'dashboard',  icon: '📊', label: zh ? '總覽'    : 'Dashboard' },
    { tab: 'workflows',  icon: '🔄', label: zh ? '流程'    : 'Workflows' },
    { tab: 'tasks',      icon: '📋', label: zh ? '任務'    : 'Tasks' },
    { tab: 'checklists', icon: '✅', label: zh ? '查核清單' : 'Checklists' },
  ];

  const orgSubItems = [
    { tab: 'dashboard',   icon: '📊', label: zh ? '總覽' : 'Dashboard' },
    { tab: 'orgs',        icon: '🏢', label: zh ? '組織' : 'Org' },
    { tab: 'companies',   icon: '🏛️', label: zh ? '公司' : 'Company' },
    { tab: 'locations',   icon: '📍', label: zh ? '門市' : 'Locations' },
    { tab: 'departments', icon: '🗂', label: zh ? '部門' : 'Departments' },
    { tab: 'employees',   icon: '👥', label: zh ? '員工' : 'Employees' },
    { tab: 'line',        icon: '💬', label: 'LINE' },
    { tab: 'billing',     icon: '💳', label: zh ? '帳單' : 'Billing' },
  ];

  // Active tab is read from URL search params
  const searchTab = new URLSearchParams(location.search).get('tab') || 'dashboard';

  return (
    <aside className={`sidebar ${collapsed ? 'sidebar-collapsed' : ''}`}>
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <div className="sidebar-logo-icon">🤖</div>
          {!collapsed && (
            <div>
              <h1>AI LINE Bot</h1>
              <span>Operations System</span>
            </div>
          )}
        </div>
        <button className="sidebar-toggle" onClick={toggleCollapse} title={collapsed ? 'Expand' : 'Collapse'}>
          {collapsed ? '▸' : '◂'}
        </button>
      </div>

      <nav className="sidebar-nav">
        {/* Main Menu */}
        <div className="nav-section">
          {!collapsed && <div className="nav-section-title">{zh ? '主選單' : 'MAIN MENU'}</div>}
          {mainNavItems.map(item => (
            <NavLink
              key={item.path}
              to={item.path}
              className={`nav-item ${location.pathname === item.path ? 'active' : ''}`}
              title={collapsed ? item.label : undefined}
            >
              <span className="icon">{item.icon}</span>
              {!collapsed && item.label}
            </NavLink>
          ))}
        </div>

        {/* HR Management collapsible group */}
        {hrNavItems.length > 0 && <div className="nav-section">
          {!collapsed && <div className="nav-section-title">{zh ? '人資管理' : 'HR MANAGEMENT'}</div>}
          <button
            className={`nav-item ${hrNavItems.some(i => i.path === location.pathname) ? 'active' : ''}`}
            style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', justifyContent: 'space-between' }}
            onClick={() => setHrOpen(o => !o)}
            title={collapsed ? (zh ? '人資管理' : 'HR Management') : undefined}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
              <span className="icon">👥</span>
              {!collapsed && (zh ? '人資管理' : 'HR Management')}
            </span>
            {!collapsed && <span style={{ fontSize: '10px', opacity: 0.5, marginLeft: '4px' }}>{hrOpen ? '▾' : '▸'}</span>}
          </button>
          {hrOpen && !collapsed && (
            <div style={{ paddingLeft: '10px', marginTop: '2px' }}>
              {hrNavItems.map(item => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className={`nav-item ${location.pathname === item.path ? 'active' : ''}`}
                  style={{ fontSize: '12.5px', paddingLeft: '10px' }}
                >
                  <span className="icon" style={{ fontSize: '13px' }}>{item.icon}</span>
                  {item.label}
                </NavLink>
              ))}
            </div>
          )}
        </div>}

        {/* Operations Management collapsible group */}
        {(isAccessible('operations-analytics') || isAccessible('vendors') || isAccessible('inventory')) && <div className="nav-section">
          {!collapsed && <div className="nav-section-title">{zh ? '營運管理' : 'OPERATIONS'}</div>}
          <button
            className={`nav-item ${opsPaths.includes(location.pathname) ? 'active' : ''}`}
            style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', justifyContent: 'space-between' }}
            onClick={() => setOpsOpen(o => !o)}
            title={collapsed ? (zh ? '營運管理' : 'Operations') : undefined}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
              <span className="icon">📈</span>
              {!collapsed && (zh ? '營運管理' : 'Operations')}
            </span>
            {!collapsed && <span style={{ fontSize: '10px', opacity: 0.5, marginLeft: '4px' }}>{opsOpen ? '▾' : '▸'}</span>}
          </button>
          {opsOpen && !collapsed && (
            <div style={{ paddingLeft: '10px', marginTop: '2px' }}>
              {isAccessible('operations-analytics') && (
                <NavLink to="/operations-analytics" className={`nav-item ${location.pathname === '/operations-analytics' ? 'active' : ''}`} style={{ fontSize: '12.5px', paddingLeft: '10px' }}>
                  <span className="icon" style={{ fontSize: '13px' }}>📊</span>{zh ? '營運分析' : 'Analytics'}
                </NavLink>
              )}
              {isAccessible('vendors') && (
                <NavLink to="/vendors" className={`nav-item ${location.pathname === '/vendors' ? 'active' : ''}`} style={{ fontSize: '12.5px', paddingLeft: '10px' }}>
                  <span className="icon" style={{ fontSize: '13px' }}>🏭</span>{zh ? '供應商' : 'Vendors'}
                </NavLink>
              )}
              {isAccessible('inventory') && (
                <NavLink to="/inventory" className={`nav-item ${location.pathname === '/inventory' ? 'active' : ''}`} style={{ fontSize: '12.5px', paddingLeft: '10px' }}>
                  <span className="icon" style={{ fontSize: '13px' }}>📦</span>{zh ? '庫存' : 'Inventory'}
                </NavLink>
              )}
            </div>
          )}
        </div>}

        {/* Workflow Management collapsible group */}
        {isAccessible('workflow-management') && <div className="nav-section">
          {!collapsed && <div className="nav-section-title">{zh ? '流程管理' : 'WORKFLOWS'}</div>}

          <button
            className={`nav-item ${isWfPath ? 'active' : ''}`}
            style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', justifyContent: 'space-between' }}
            onClick={() => setWfOpen(o => !o)}
            title={collapsed ? (zh ? '流程管理' : 'Workflow Mgmt') : undefined}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
              <span className="icon">🔄</span>
              {!collapsed && (zh ? '流程管理' : 'Workflow Mgmt')}
            </span>
            {!collapsed && <span style={{ fontSize: '10px', opacity: 0.5, marginLeft: '4px' }}>{wfOpen ? '▾' : '▸'}</span>}
          </button>

          {wfOpen && !collapsed && (
            <div style={{ paddingLeft: '10px', marginTop: '2px' }}>
              {wfSubItems.map(item => {
                const isActive = isWfPath && searchTab === item.tab;
                return (
                  <NavLink
                    key={item.tab}
                    to={`/workflow-management?tab=${item.tab}`}
                    className={`nav-item ${isActive ? 'active' : ''}`}
                    style={{ fontSize: '12.5px', paddingLeft: '10px' }}
                  >
                    <span className="icon" style={{ fontSize: '13px' }}>{item.icon}</span>
                    {item.label}
                  </NavLink>
                );
              })}
            </div>
          )}
        </div>}

        {/* Org Management collapsible group */}
        {isAccessible('org-management') && <div className="nav-section">
          {!collapsed && <div className="nav-section-title">{zh ? '組織管理' : 'ORG MANAGEMENT'}</div>}

          <button
            className={`nav-item ${isOrgPath ? 'active' : ''}`}
            style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', justifyContent: 'space-between' }}
            onClick={() => setOrgOpen(o => !o)}
            title={collapsed ? (zh ? '組織管理' : 'Org Management') : undefined}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
              <span className="icon">🏢</span>
              {!collapsed && (zh ? '組織管理' : 'Org Management')}
            </span>
            {!collapsed && <span style={{ fontSize: '10px', opacity: 0.5, marginLeft: '4px' }}>{orgOpen ? '▾' : '▸'}</span>}
          </button>

          {orgOpen && !collapsed && (
            <div style={{ paddingLeft: '10px', marginTop: '2px' }}>
              {orgSubItems.map(item => {
                const isActive = isOrgPath && searchTab === item.tab;
                return (
                  <NavLink
                    key={item.tab}
                    to={`/org-management?tab=${item.tab}`}
                    className={`nav-item ${isActive ? 'active' : ''}`}
                    style={{ fontSize: '12.5px', paddingLeft: '10px' }}
                  >
                    <span className="icon" style={{ fontSize: '13px' }}>{item.icon}</span>
                    {item.label}
                  </NavLink>
                );
              })}
            </div>
          )}
        </div>}

        {/* System */}
        <div className="nav-section">
          {!collapsed && <div className="nav-section-title">{zh ? '系統' : 'SYSTEM'}</div>}
          {isAccessible('triggers') && (
            <NavLink to="/triggers" className={`nav-item ${location.pathname === '/triggers' ? 'active' : ''}`} title={collapsed ? t('nav.triggers') : undefined}>
              <span className="icon">⚡</span>{!collapsed && t('nav.triggers')}
            </NavLink>
          )}
          {isAccessible('notifications') && (
            <NavLink to="/notifications" className={`nav-item ${location.pathname === '/notifications' ? 'active' : ''}`} title={collapsed ? t('nav.notifications') : undefined}>
              <span className="icon">🔔</span>{!collapsed && t('nav.notifications')}
            </NavLink>
          )}
          {isAccessible('users') && (
            <NavLink to="/users" className={`nav-item ${location.pathname === '/users' ? 'active' : ''}`} title={collapsed ? t('nav.users') : undefined}>
              <span className="icon">👤</span>{!collapsed && t('nav.users')}
            </NavLink>
          )}
          {isAccessible('line-logs') && (
            <NavLink to="/line-logs" className={`nav-item ${location.pathname === '/line-logs' ? 'active' : ''}`} title={collapsed ? (zh ? 'LINE 記錄' : 'LINE Logs') : undefined}>
              <span className="icon">📊</span>{!collapsed && (zh ? 'LINE 記錄' : 'LINE Logs')}
            </NavLink>
          )}
          {isAccessible('admin') && (
            <NavLink to="/admin" className={`nav-item ${location.pathname === '/admin' ? 'active' : ''}`} title={collapsed ? (zh ? '系統設定' : 'Admin Settings') : undefined}>
              <span className="icon">⚙️</span>{!collapsed && (zh ? '系統設定' : 'Admin Settings')}
            </NavLink>
          )}
        </div>

        {/* AI Tools */}
        <div className="nav-section">
          {!collapsed && <div className="nav-section-title">{zh ? 'AI 工具' : 'AI TOOLS'}</div>}
          {isAccessible('help-center') && (
            <NavLink to="/help-center" className={`nav-item ${location.pathname === '/help-center' ? 'active' : ''}`} title={collapsed ? (zh ? '說明中心' : 'Help Center') : undefined}>
              <span className="icon">📚</span>{!collapsed && (zh ? '說明中心' : 'Help Center')}
            </NavLink>
          )}
          {isAccessible('agent-console') && (
            <NavLink to="/agent-console" className={`nav-item ${location.pathname === '/agent-console' ? 'active' : ''}`} title={collapsed ? (zh ? 'Agent 控制台' : 'Agent Console') : undefined}>
              <span className="icon">🤖</span>{!collapsed && (zh ? 'Agent 控制台' : 'Agent Console')}
            </NavLink>
          )}
        </div>
      </nav>

      <div className="sidebar-footer-btns">
        {collapsed ? (
          <button className="theme-btn" onClick={toggleLocale} title={zh ? 'English' : '中文'}>🌐</button>
        ) : (
          <button className="locale-btn" onClick={toggleLocale}>
            🌐 {zh ? 'English' : '中文'}
          </button>
        )}
        <button className="theme-btn" aria-label={zh ? '切換主題' : 'Toggle theme'} onClick={toggleTheme}>
          {theme === 'light' ? '🌙' : '☀️'}
        </button>
      </div>
    </aside>
  );
}

function AppContent() {
  const sidebarCollapsed = localStorage.getItem('sidebar-collapsed') === 'true';
  const [collapsed, setCollapsed] = useState(sidebarCollapsed);

  // Listen for sidebar toggle via storage events
  useEffect(() => {
    const handler = () => setCollapsed(localStorage.getItem('sidebar-collapsed') === 'true');
    window.addEventListener('storage', handler);
    // Also poll for same-tab changes
    const interval = setInterval(handler, 200);
    return () => { window.removeEventListener('storage', handler); clearInterval(interval); };
  }, []);

  return (
    <div className="app-layout">
      <Sidebar />
      <main className="main-content" style={{ marginLeft: collapsed ? '64px' : undefined }}>
        <PermissionGuard>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/tasks" element={<Tasks />} />
            <Route path="/workflows" element={<Workflows />} />
            <Route path="/checklists" element={<Checklists />} />
            <Route path="/line" element={<LineManagement />} />
            <Route path="/triggers" element={<Triggers />} />
            <Route path="/notifications" element={<Notifications />} />
            <Route path="/users" element={<Users />} />
            <Route path="/employees" element={<Employees />} />
            <Route path="/scheduling" element={<Scheduling />} />
            <Route path="/holidays" element={<Holidays />} />
            <Route path="/shift-rules" element={<ShiftRules />} />
            <Route path="/admin" element={<AdminSettings />} />
            <Route path="/time-tracker" element={<TimeTracker />} />
            <Route path="/hr-dashboard" element={<HrDashboard />} />
            <Route path="/manager-dashboard" element={<ManagerDashboard />} />
            <Route path="/org-management" element={<OrgManagement />} />
            <Route path="/workflow-management" element={<WorkflowManagement />} />
            <Route path="/leave-management" element={<LeaveManagement />} />
            <Route path="/overtime-requests" element={<OvertimeRequests />} />
            <Route path="/payroll" element={<PayrollManagement />} />
            <Route path="/help-center" element={<HelpCenter />} />
            <Route path="/agent-console" element={<AgentConsole />} />
            <Route path="/audit-logs" element={<AuditLogs />} />
            <Route path="/line-logs" element={<LineLogs />} />
            <Route path="/performance" element={<PerformanceManagement />} />
            <Route path="/documents" element={<DocumentManagement />} />
            <Route path="/recruitment" element={<RecruitmentATS />} />
            <Route path="/business-trips" element={<BusinessTrips />} />
            <Route path="/expense-claims" element={<ExpenseClaims />} />
            <Route path="/onboarding" element={<Onboarding />} />
            <Route path="/announcements" element={<Announcements />} />
            <Route path="/training" element={<Training />} />
            <Route path="/disciplinary" element={<Disciplinary />} />
            <Route path="/jobs" element={<JobsManagement />} />
            <Route path="/operations-analytics" element={<OperationsAnalytics />} />
            <Route path="/vendors" element={<VendorManagement />} />
            <Route path="/inventory" element={<InventoryManagement />} />
          </Routes>
        </PermissionGuard>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <OrgProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/liff/app" element={<LiffApp />} />
          <Route path="/liff/dashboard" element={<LiffManagerDashboard />} />
          <Route path="/*" element={<AppContent />} />
        </Routes>
      </BrowserRouter>
    </OrgProvider>
  );
}
