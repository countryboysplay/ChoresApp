import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { Icon, type IconName } from '../design/icons';
import { Sheet } from '../design/primitives';

const PRIMARY: { to: string; label: string; icon: IconName }[] = [
  { to: '/child/home', label: 'Home', icon: 'home' },
  { to: '/child/missions', label: 'Missions', icon: 'missions' },
  { to: '/child/rewards', label: 'Rewards', icon: 'gift' },
  { to: '/child/leaderboard', label: 'Leaderboard', icon: 'trophy' },
];

const MORE: { to: string; label: string; icon: IconName }[] = [
  { to: '/child/achievements', label: 'Achievements', icon: 'star' },
  { to: '/child/wallet', label: 'Wallet', icon: 'wallet' },
  { to: '/child/notifications', label: 'Inbox', icon: 'inbox' },
  { to: '/child/profile', label: 'Profile', icon: 'user' },
];

export function ChildShell() {
  const [moreOpen, setMoreOpen] = useState(false);
  const navigate = useNavigate();

  return (
    <>
      <Outlet />

      <nav className="navbar" aria-label="Main">
        {PRIMARY.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) => `navbar__item ${isActive ? 'is-active' : ''}`}
          >
            <Icon name={item.icon} size={22} />
            {item.label}
          </NavLink>
        ))}
        <button type="button" className="navbar__item" onClick={() => setMoreOpen(true)}>
          <Icon name="more" size={22} />
          More
        </button>
      </nav>

      {moreOpen && (
        <Sheet title="More" onClose={() => setMoreOpen(false)}>
          <div className="stack stack--tight">
            {MORE.map((item) => (
              <button
                key={item.to}
                type="button"
                className="card card--interactive row"
                onClick={() => {
                  setMoreOpen(false);
                  navigate(item.to);
                }}
              >
                <span className="tile-icon tile-icon--sm tile-icon--blue">
                  <Icon name={item.icon} size={20} />
                </span>
                <span style={{ fontWeight: 700, flex: 1 }}>{item.label}</span>
                <Icon name="chevron" size={18} />
              </button>
            ))}
            <button
              type="button"
              className="btn btn--quiet btn--block"
              onClick={() => navigate('/profiles')}
              style={{ marginTop: 'var(--space-2)' }}
            >
              Switch player
            </button>
          </div>
        </Sheet>
      )}
    </>
  );
}
