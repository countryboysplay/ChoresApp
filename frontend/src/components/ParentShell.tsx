import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { NeonArt } from '../design/neon';
import { Icon, type IconName } from '../design/icons';
import { useAuth } from '../lib/auth';
import '../design/neon-parent.css';

const TABS: { to: string; label: string; icon: IconName }[] = [
  { to: '/parent', label: 'Dashboard', icon: 'home' },
  { to: '/parent/schedule', label: 'Schedule', icon: 'calendar-check' },
  { to: '/parent/approvals', label: 'Approvals', icon: 'approve' },
  { to: '/parent/children', label: 'Manage', icon: 'users' },
  { to: '/parent/settings', label: 'Settings', icon: 'settings' },
];

const SIDEBAR: { to: string; label: string; icon: IconName }[] = [
  { to: '/parent', label: 'Dashboard', icon: 'home' },
  { to: '/parent/schedule', label: 'Schedule', icon: 'calendar-check' },
  { to: '/parent/approvals', label: 'Approvals', icon: 'approve' },
  { to: '/parent/chores', label: 'Chores', icon: 'chores' },
  { to: '/parent/bonus', label: 'Bonus chores', icon: 'bonus' },
  { to: '/parent/rewards', label: 'Rewards', icon: 'rewards' },
  { to: '/parent/children', label: 'Kids', icon: 'users' },
  { to: '/parent/notifications', label: 'Inbox', icon: 'inbox' },
  { to: '/parent/settings', label: 'Settings', icon: 'settings' },
  { to: '/parent/system', label: 'System status', icon: 'server' },
];

const THEME_KEY = 'chore-quest:parent-theme';
type ParentTheme = 'dark' | 'light';

/** Per device; storage can throw in private mode, which just means dark. */
function storedTheme(): ParentTheme {
  try {
    return localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

/** Signs the parent out and returns to the profile picker. */
export function useSwitchUser() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  return async () => {
    await logout();
    navigate('/profiles');
  };
}

/** Bottom navigation on phones, persistent sidebar on desktop. */
export function ParentShell() {
  const switchUser = useSwitchUser();
  const [theme, setTheme] = useState<ParentTheme>(storedTheme);
  const next: ParentTheme = theme === 'dark' ? 'light' : 'dark';
  const toggleLabel = next === 'light' ? 'Light mode' : 'Dark mode';

  useEffect(() => {
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      // Not saved; the toggle still works for this visit.
    }
  }, [theme]);

  return (
    <div className="parent-layout" data-theme={theme}>
      <nav className="sidebar" aria-label="Parent sections">
        <div className="logo row" style={{ fontSize: 'var(--text-lg)', padding: 'var(--space-3)', gap: 'var(--space-2)' }}>
          <NeonArt group="ui" name="parent-dashboard-mark" size={28} />
          Chore Quest
        </div>
        {SIDEBAR.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/parent'}
            className={({ isActive }) => `sidebar__item ${isActive ? 'is-active' : ''}`}
          >
            <Icon name={item.icon} size={20} />
            {item.label}
          </NavLink>
        ))}
        <button
          type="button"
          className="sidebar__item sidebar__theme"
          onClick={() => setTheme(next)}
        >
          <Icon name={next === 'light' ? 'sun' : 'moon'} size={20} />
          {toggleLabel}
        </button>
        <button type="button" className="sidebar__item sidebar__signout" onClick={() => void switchUser()}>
          <Icon name="logout" size={20} />
          Switch user
        </button>
      </nav>

      <div>
        <div className="brandbar">
          <span className="logo" style={{ fontSize: 'var(--text-base)' }}>
            Chore Quest
          </span>
          <NeonArt group="brand" name="app-icon" size={24} />
          <button
            type="button"
            className="iconbtn theme-toggle"
            aria-label={toggleLabel}
            title={toggleLabel}
            onClick={() => setTheme(next)}
          >
            <Icon name={next === 'light' ? 'sun' : 'moon'} size={18} />
          </button>
        </div>
        <Outlet />
      </div>

      <nav className="navbar navbar--parent" aria-label="Parent">
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.to === '/parent'}
            className={({ isActive }) => `navbar__item ${isActive ? 'is-active' : ''}`}
          >
            <Icon name={tab.icon} size={22} />
            {tab.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
