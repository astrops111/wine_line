import { BrowserRouter, Routes, Route, NavLink, useLocation } from 'react-router-dom';
import { useState } from 'react';
import { t, setLocale, getLocale, initLocale, type Locale } from './lib/i18n';
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
import './index.css';

initLocale();

function Sidebar() {
  const [locale, setCurrentLocale] = useState<Locale>(getLocale());
  const location = useLocation();

  const toggleLocale = () => {
    const next = locale === 'zh-TW' ? 'en' : 'zh-TW';
    setLocale(next);
    setCurrentLocale(next);
    window.location.reload();
  };

  const navItems = [
    { path: '/', icon: '📊', label: t('nav.dashboard') },
    { path: '/tasks', icon: '📋', label: t('nav.tasks') },
    { path: '/workflows', icon: '🔄', label: t('nav.workflows') },
    { path: '/checklists', icon: '✅', label: t('nav.checklists') },
    { path: '/line', icon: '💬', label: t('nav.line') },
    { path: '/employees', icon: '👥', label: t('nav.employees') },
    { path: '/scheduling', icon: '📅', label: t('nav.scheduling') },
    { path: '/holidays', icon: '🗓', label: t('nav.holidays') },
    { path: '/time-tracker', icon: '⏱', label: locale === 'zh-TW' ? '打卡追蹤' : 'Time Tracker' },
    { path: '/hr-dashboard', icon: '📈', label: locale === 'zh-TW' ? 'HR 報表' : 'HR Dashboard' },
    { path: '/shift-rules', icon: '⚖️', label: locale === 'zh-TW' ? '排班規則' : 'Shift Rules' },
    { path: '/manager-dashboard', icon: '🎯', label: locale === 'zh-TW' ? '營運看板' : 'Ops Dashboard' },
  ];

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <div className="sidebar-logo-icon">🤖</div>
          <div>
            <h1>AI LINE Bot</h1>
            <span>Operations System</span>
          </div>
        </div>
      </div>

      <nav className="sidebar-nav">
        <div className="nav-section">
          <div className="nav-section-title">{locale === 'zh-TW' ? '主選單' : 'MAIN MENU'}</div>
          {navItems.map(item => (
            <NavLink
              key={item.path}
              to={item.path}
              className={`nav-item ${location.pathname === item.path ? 'active' : ''}`}
            >
              <span className="icon">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </div>

        <div className="nav-section">
          <div className="nav-section-title">{locale === 'zh-TW' ? '系統' : 'SYSTEM'}</div>
          <NavLink to="/triggers" className={`nav-item ${location.pathname === '/triggers' ? 'active' : ''}`}>
            <span className="icon">⚡</span>
            {t('nav.triggers')}
          </NavLink>
          <NavLink to="/notifications" className={`nav-item ${location.pathname === '/notifications' ? 'active' : ''}`}>
            <span className="icon">🔔</span>
            {t('nav.notifications')}
          </NavLink>
          <NavLink to="/users" className={`nav-item ${location.pathname === '/users' ? 'active' : ''}`}>
            <span className="icon">👤</span>
            {t('nav.users')}
          </NavLink>
          <NavLink to="/admin" className={`nav-item ${location.pathname === '/admin' ? 'active' : ''}`}>
            <span className="icon">⚙️</span>
            {locale === 'zh-TW' ? '系統設定' : 'Admin Settings'}
          </NavLink>
        </div>
      </nav>

      <div className="locale-switcher">
        <button className="locale-btn" onClick={toggleLocale}>
          🌐 {locale === 'zh-TW' ? '切換為 English' : 'Switch to 中文'}
        </button>
      </div>
    </aside>
  );
}

function AppContent() {
  return (
    <div className="app-layout">
      <Sidebar />
      <main className="main-content">
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
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/liff/app" element={<LiffApp />} />
        <Route path="/liff/dashboard" element={<LiffManagerDashboard />} />
        <Route path="/*" element={<AppContent />} />
      </Routes>
    </BrowserRouter>
  );
}
