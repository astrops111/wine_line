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
        </Routes>
      </main>
    </div>
  );
}


export default function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}
