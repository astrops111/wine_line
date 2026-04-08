import { BrowserRouter, Routes, Route, NavLink, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { t, setLocale, getLocale, initLocale, type Locale } from './lib/i18n';
import { initTheme, getTheme, setTheme, type Theme } from './lib/theme';
import { OrgProvider, useOrg } from './lib/OrgContext';
import { canAccess, getModuleForPath } from './lib/permissions';
import {
  LayoutDashboard, Target, BarChart3, Clock, Palmtree, Timer,
  Wallet, CalendarDays, CalendarOff, Scale, Award, Search, FolderOpen,
  ClipboardList, Plane, Receipt, UserPlus, Megaphone, GraduationCap, Gavel,
  Users as UsersIcon, RefreshCw, CheckSquare, Building2, Zap, Bell, User, Settings,
  BookOpen, Bot, Menu, X, Globe, Moon, Sun,
  BarChart2, Factory, Package, MessageSquare,
} from 'lucide-react';

const IC = { size: 16, strokeWidth: 1.75 } as const;
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

// ── Navigation data ────────────────────────────────────────────────────────
type NavItem = { path: string; icon: React.ReactNode; label: string; moduleKey: string };
type NavSubgroup = { title: string; items: NavItem[] };
type NavGroup = { key: string; label: string; icon: React.ReactNode; items: NavItem[]; subgroups?: NavSubgroup[] };

function useNavGroups() {
  const zh = getLocale() === 'zh-TW';
  return {
    groups: [
      { key: 'dashboard', label: zh ? '總覽' : 'Dashboard', icon: <LayoutDashboard {...IC} />, items: [
        { path: '/', icon: <LayoutDashboard {...IC} />, label: t('nav.dashboard'), moduleKey: 'dashboard' },
        { path: '/manager-dashboard', icon: <Target {...IC} />, label: zh ? '營運看板' : 'Ops Dashboard', moduleKey: 'manager-dashboard' },
      ]},
      { key: 'hr', label: zh ? '人資' : 'People', icon: <UsersIcon {...IC} />, items: [], subgroups: [
        { title: zh ? '考勤薪資' : 'Attendance & Pay', items: [
          { path: '/hr-dashboard',      icon: <BarChart3 {...IC} />,    label: zh ? 'HR 報表'  : 'HR Dashboard', moduleKey: 'hr-dashboard' },
          { path: '/time-tracker',      icon: <Clock {...IC} />,        label: zh ? '打卡追蹤' : 'Time Tracker',  moduleKey: 'time-tracker' },
          { path: '/leave-management',  icon: <Palmtree {...IC} />,     label: zh ? '請假管理' : 'Leave Mgmt',    moduleKey: 'leave-management' },
          { path: '/overtime-requests', icon: <Timer {...IC} />,        label: zh ? '加班申請' : 'Overtime',      moduleKey: 'overtime-requests' },
          { path: '/payroll',           icon: <Wallet {...IC} />,       label: zh ? '薪資管理' : 'Payroll',       moduleKey: 'payroll' },
        ]},
        { title: zh ? '排班管理' : 'Scheduling', items: [
          { path: '/scheduling',  icon: <CalendarDays {...IC} />, label: zh ? '排班'     : 'Scheduling',  moduleKey: 'scheduling' },
          { path: '/holidays',    icon: <CalendarOff {...IC} />,  label: zh ? '假日管理' : 'Holidays',    moduleKey: 'holidays' },
          { path: '/shift-rules', icon: <Scale {...IC} />,        label: zh ? '排班規則' : 'Shift Rules', moduleKey: 'shift-rules' },
        ]},
        { title: zh ? '人才發展' : 'Talent', items: [
          { path: '/performance',  icon: <Award {...IC} />,          label: zh ? '績效管理' : 'Performance',  moduleKey: 'performance' },
          { path: '/recruitment',  icon: <Search {...IC} />,         label: zh ? '招募管理' : 'Recruitment',  moduleKey: 'recruitment' },
          { path: '/onboarding',   icon: <UserPlus {...IC} />,       label: zh ? '到職離職' : 'Onboarding',   moduleKey: 'onboarding' },
          { path: '/training',     icon: <GraduationCap {...IC} />,  label: zh ? '教育訓練' : 'Training',     moduleKey: 'training' },
          { path: '/disciplinary', icon: <Gavel {...IC} />,          label: zh ? '獎懲紀錄' : 'Disciplinary', moduleKey: 'disciplinary' },
        ]},
        { title: zh ? '行政庶務' : 'Admin', items: [
          { path: '/documents',      icon: <FolderOpen {...IC} />, label: zh ? '文件管理' : 'Documents',      moduleKey: 'documents' },
          { path: '/business-trips', icon: <Plane {...IC} />,      label: zh ? '公出差旅' : 'Business Trips', moduleKey: 'business-trips' },
          { path: '/expense-claims', icon: <Receipt {...IC} />,    label: zh ? '費用核銷' : 'Expense Claims', moduleKey: 'expense-claims' },
          { path: '/announcements',  icon: <Megaphone {...IC} />,  label: zh ? '公告管理' : 'Announcements',  moduleKey: 'announcements' },
        ]},
      ]},
      { key: 'ops', label: zh ? '營運' : 'Operations', icon: <BarChart2 {...IC} />, items: [
        { path: '/operations-analytics', icon: <BarChart3 {...IC} />, label: zh ? '營運分析' : 'Analytics', moduleKey: 'operations-analytics' },
        { path: '/vendors',   icon: <Factory {...IC} />,  label: zh ? '供應商' : 'Vendors',   moduleKey: 'vendors' },
        { path: '/inventory', icon: <Package {...IC} />,  label: zh ? '庫存'   : 'Inventory', moduleKey: 'inventory' },
      ]},
      { key: 'workflow', label: zh ? '流程' : 'Workflows', icon: <RefreshCw {...IC} />, items: [
        { path: '/workflow-management?tab=dashboard',  icon: <BarChart3 {...IC} />,    label: zh ? '總覽'    : 'Dashboard',  moduleKey: 'workflow-management' },
        { path: '/workflow-management?tab=workflows',  icon: <RefreshCw {...IC} />,    label: zh ? '流程'    : 'Workflows',  moduleKey: 'workflow-management' },
        { path: '/workflow-management?tab=tasks',      icon: <ClipboardList {...IC} />, label: zh ? '任務'    : 'Tasks',      moduleKey: 'workflow-management' },
        { path: '/workflow-management?tab=checklists', icon: <CheckSquare {...IC} />,  label: zh ? '查核清單' : 'Checklists', moduleKey: 'workflow-management' },
      ]},
      { key: 'org', label: zh ? '組織' : 'Organization', icon: <Building2 {...IC} />, items: [
        { path: '/org-management?tab=dashboard',   icon: <BarChart3 {...IC} />,      label: zh ? '總覽' : 'Dashboard',   moduleKey: 'org-management' },
        { path: '/org-management?tab=orgs',        icon: <Building2 {...IC} />,      label: zh ? '組織' : 'Org',         moduleKey: 'org-management' },
        { path: '/org-management?tab=companies',   icon: <Building2 {...IC} />,      label: zh ? '公司' : 'Company',     moduleKey: 'org-management' },
        { path: '/org-management?tab=locations',   icon: <Target {...IC} />,         label: zh ? '門市' : 'Locations',   moduleKey: 'org-management' },
        { path: '/org-management?tab=departments', icon: <FolderOpen {...IC} />,     label: zh ? '部門' : 'Departments', moduleKey: 'org-management' },
        { path: '/org-management?tab=employees',   icon: <UsersIcon {...IC} />,      label: zh ? '員工' : 'Employees',   moduleKey: 'org-management' },
        { path: '/org-management?tab=line',        icon: <MessageSquare {...IC} />,  label: 'LINE',                      moduleKey: 'org-management' },
        { path: '/org-management?tab=billing',     icon: <Wallet {...IC} />,         label: zh ? '帳單' : 'Billing',     moduleKey: 'org-management' },
      ]},
      { key: 'system', label: zh ? '系統' : 'System', icon: <Settings {...IC} />, items: [
        { path: '/triggers',      icon: <Zap {...IC} />,           label: t('nav.triggers'),       moduleKey: 'triggers' },
        { path: '/notifications', icon: <Bell {...IC} />,          label: t('nav.notifications'),  moduleKey: 'notifications' },
        { path: '/users',         icon: <User {...IC} />,          label: t('nav.users'),          moduleKey: 'users' },
        { path: '/audit-logs',    icon: <ClipboardList {...IC} />, label: zh ? '稽核記錄' : 'Audit Logs', moduleKey: 'audit-logs' },
        { path: '/line-logs',     icon: <BarChart3 {...IC} />,     label: zh ? 'LINE 記錄' : 'LINE Logs', moduleKey: 'line-logs' },
        { path: '/admin',         icon: <Settings {...IC} />,      label: zh ? '系統設定' : 'Admin Settings', moduleKey: 'admin' },
      ]},
      { key: 'ai', label: zh ? '說明中心' : 'Help', icon: <BookOpen {...IC} />, items: [
        { path: '/help-center',   icon: <BookOpen {...IC} />, label: zh ? '說明中心'     : 'Help Center',    moduleKey: 'help-center' },
        { path: '/agent-console', icon: <Bot {...IC} />,      label: zh ? 'Agent 控制台' : 'Agent Console', moduleKey: 'agent-console' },
      ]},
    ] as NavGroup[],
  };
}

function getAllItems(g: NavGroup): NavItem[] {
  const items = [...g.items];
  if (g.subgroups) for (const sg of g.subgroups) items.push(...sg.items);
  return items;
}

function getActiveGroup(groups: NavGroup[], pathname: string, search: string): string {
  const full = pathname + search;
  for (const g of groups) {
    if (getAllItems(g).some(i => {
      if (i.path.includes('?')) return full.startsWith(i.path.split('?')[0]) && full.includes(i.path.split('?')[1]);
      return i.path === pathname;
    })) return g.key;
  }
  return 'dashboard';
}

// ── Top Navigation Bar ────────────────────────────────────────────────────
function TopNav() {
  const [locale, setCurrentLocale] = useState<Locale>(getLocale());
  const [theme, setCurrentTheme] = useState<Theme>(getTheme());
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const location = useLocation();
  const { userRoles, modules } = useOrg();
  const { groups } = useNavGroups();
  const zh = locale === 'zh-TW';

  // Close menu on navigation
  useEffect(() => { setOpenMenu(null); }, [location.pathname, location.search]);

  const isAccessible = (moduleKey: string): boolean => {
    const mod = modules.find(m => m.module_key === moduleKey);
    if (!mod) return true;
    if (!mod.is_enabled) return false;
    return canAccess(mod.required_role, userRoles);
  };

  const activeGroup = getActiveGroup(groups, location.pathname, location.search);

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

  return (
    <nav className="topnav">
      <NavLink to="/" className="topnav-brand">
        <div className="topnav-brand-icon"><Bot size={16} color="#fff" /></div>
        <span className="topnav-brand-label">AI LINE Bot</span>
      </NavLink>

      <div className="topnav-groups">
        {groups.filter(g => getAllItems(g).some(i => isAccessible(i.moduleKey))).map(g => {
          const allItems = getAllItems(g);
          const accessibleItems = allItems.filter(i => isAccessible(i.moduleKey));
          if (accessibleItems.length === 0) return null;
          const isOpen = openMenu === g.key;
          const hasSubgroups = g.subgroups && g.subgroups.length > 0;
          return (
            <div key={g.key} style={{ position: 'relative' }}>
              <button
                className={`topnav-group-btn ${activeGroup === g.key ? 'active' : ''}`}
                onClick={() => setOpenMenu(isOpen ? null : g.key)}
              >
                <span className="icon">{g.icon}</span>
                {g.label}
              </button>
              {isOpen && (
                hasSubgroups ? (
                  <div className="topnav-dropdown topnav-dropdown-multi">
                    {g.subgroups!.map(sg => {
                      const sgItems = sg.items.filter(i => isAccessible(i.moduleKey));
                      if (sgItems.length === 0) return null;
                      return (
                        <div key={sg.title} className="topnav-dropdown-col">
                          <div className="topnav-dropdown-heading">{sg.title}</div>
                          {sgItems.map(item => (
                            <NavLink key={item.path} to={item.path}
                              className={({ isActive }) => `topnav-dropdown-item ${isActive ? 'active' : ''}`}
                              onClick={() => setOpenMenu(null)}>
                              <span className="icon">{item.icon}</span>
                              {item.label}
                            </NavLink>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="topnav-dropdown">
                    {accessibleItems.map(item => (
                      <NavLink key={item.path} to={item.path}
                        className={({ isActive }) => `topnav-dropdown-item ${isActive ? 'active' : ''}`}
                        onClick={() => setOpenMenu(null)}>
                        <span className="icon">{item.icon}</span>
                        {item.label}
                      </NavLink>
                    ))}
                  </div>
                )
              )}
            </div>
          );
        })}
      </div>

      <div className="topnav-right">
        <button className="locale-btn" onClick={toggleLocale}>
          <Globe size={12} /> {zh ? 'EN' : '中'}
        </button>
        <button className="theme-btn" onClick={toggleTheme} aria-label={zh ? '切換主題' : 'Toggle theme'}>
          {theme === 'light' ? <Moon size={13} /> : <Sun size={13} />}
        </button>
      </div>
    </nav>
  );
}

// ── Sidebar — contextual sub-items for the active group ───────────────────
function Sidebar({ mobileOpen }: { mobileOpen?: boolean }) {
  const location = useLocation();
  const { userRoles, modules } = useOrg();
  const { groups } = useNavGroups();

  const isAccessible = (moduleKey: string): boolean => {
    const mod = modules.find(m => m.module_key === moduleKey);
    if (!mod) return true;
    if (!mod.is_enabled) return false;
    return canAccess(mod.required_role, userRoles);
  };

  const activeGroup = getActiveGroup(groups, location.pathname, location.search);
  const group = groups.find(g => g.key === activeGroup);
  const items = group?.items.filter(i => isAccessible(i.moduleKey)) || [];

  const isActive = (itemPath: string) => {
    if (itemPath.includes('?')) {
      const [base, qs] = itemPath.split('?');
      return location.pathname === base && location.search.includes(qs);
    }
    return location.pathname === itemPath;
  };

  return (
    <aside className={`sidebar ${mobileOpen ? 'mobile-open' : ''}`}>
      <nav className="sidebar-nav" style={{ paddingTop: '12px' }}>
        <div className="nav-section">
          <div className="nav-section-title">{group?.label || ''}</div>
          {items.map(item => (
            <NavLink
              key={item.path}
              to={item.path}
              className={`nav-item ${isActive(item.path) ? 'active' : ''}`}
            >
              <span className="icon">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </aside>
  );
}

function AppContent() {
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close mobile sidebar on route change
  const location = useLocation();
  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  return (
    <div className="app-layout">
      <TopNav />
      <button className="mobile-menu-btn" onClick={() => setMobileOpen(o => !o)} aria-label="Toggle menu">
        {mobileOpen ? <X size={20} /> : <Menu size={20} />}
      </button>
      <div className={`mobile-overlay ${mobileOpen ? 'active' : ''}`} onClick={() => setMobileOpen(false)} />
      <Sidebar mobileOpen={mobileOpen} />
      <main className="main-content">
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
