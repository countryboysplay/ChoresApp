import { NavLink, Outlet } from 'react-router-dom';
import { Icon, type IconName } from '../design/icons';

const TABS: { to: string; label: string; icon: IconName }[] = [
  { to: '/parent', label: 'Dashboard', icon: 'grid' },
  { to: '/parent/schedule', label: 'Schedule', icon: 'calendar' },
  { to: '/parent/approvals', label: 'Approvals', icon: 'check' },
  { to: '/parent/children', label: 'Manage', icon: 'user' },
  { to: '/parent/settings', label: 'Settings', icon: 'settings' },
];

const SIDEBAR: { to: string; label: string; icon: IconName }[] = [
  { to: '/parent', label: 'Dashboard', icon: 'grid' },
  { to: '/parent/schedule', label: 'Schedule', icon: 'calendar' },
  { to: '/parent/approvals', label: 'Approvals', icon: 'check' },
  { to: '/parent/chores', label: 'Chores', icon: 'missions' },
  { to: '/parent/bonus', label: 'Bonus chores', icon: 'star' },
  { to: '/parent/rewards', label: 'Rewards', icon: 'gift' },
  { to: '/parent/children', label: 'Kids', icon: 'user' },
  { to: '/parent/notifications', label: 'Inbox', icon: 'bell' },
  { to: '/parent/settings', label: 'Settings', icon: 'settings' },
  { to: '/parent/system', label: 'System status', icon: 'alert' },
];

/** Bottom navigation on phones, persistent sidebar on desktop. */
export function ParentShell() {
  return (
    <div className="parent-layout">
      <nav className="sidebar" aria-label="Parent sections">
        <div className="logo" style={{ fontSize: 'var(--text-lg)', padding: 'var(--space-3)' }}>
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
      </nav>

      <div>
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
