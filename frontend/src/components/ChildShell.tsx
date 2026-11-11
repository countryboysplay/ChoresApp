import { NavLink, useLocation, useNavigate, useOutlet } from 'react-router-dom';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { NeonArt } from '../design/neon';
import { Icon, type IconName } from '../design/icons';
import { Sheet } from '../design/primitives';
import { useSkyMood, useTileTilt } from '../design/NeonSky';
import { useChildDay } from '../lib/childDay';
import { isFinished } from '../screens/child/choreStatus';
import '../design/neon-hud.css';

/** Away longer than this (a real break, not a quick app switch) reopens on Today. */
const AWAY_MS = 5 * 60_000;

const PRIMARY: { to: string; label: string; icon: IconName }[] = [
  { to: '/child/home', label: 'Today', icon: 'home' },
  { to: '/child/missions', label: 'Quests', icon: 'missions' },
  { to: '/child/rewards', label: 'Rewards', icon: 'gift' },
  { to: '/child/leaderboard', label: 'Leaderboard', icon: 'trophy' },
];

const MORE: { to: string; label: string; icon: IconName }[] = [
  { to: '/child/achievements', label: 'Achievements', icon: 'achievements' },
  { to: '/child/wallet', label: 'Wallet', icon: 'wallet' },
  { to: '/child/notifications', label: 'Inbox', icon: 'bell' },
  { to: '/child/profile', label: 'Profile', icon: 'profile' },
];

export function ChildShell() {
  const [moreOpen, setMoreOpen] = useState(false);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  // useOutlet, not <Outlet>: the leaving screen must keep its own content while it fades out.
  const outlet = useOutlet();
  const { day } = useChildDay();
  // Every required chore approved: the sky turns mint and gold for the rest of the day.
  useSkyMood(Boolean(day && day.core.length > 0 && day.core.every((chore) => isFinished(chore.status))));
  useTileTilt();
  // An iPhone keeps the installed app alive in the background and resumes on the last
  // screen. Coming back after a real break should start on Today, like a fresh launch.
  useEffect(() => {
    let hiddenAt = 0;
    const onVisibility = () => {
      if (document.hidden) hiddenAt = Date.now();
      else if (hiddenAt && Date.now() - hiddenAt > AWAY_MS) navigate('/child/home', { replace: true });
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [navigate]);
  // Kid screens wear the arcade HUD skin (neon-hud.css, scoped to body.kid).
  useEffect(() => {
    document.body.classList.add('kid');
    return () => document.body.classList.remove('kid');
  }, []);

  return (
    <>
      <div className="brandbar">
        <span className="id-crop id-crop--wordmark" style={{ width: 150, marginInline: 0 }}>
          <NeonArt group="brand" name="wordmark" alt="Chore Quest" />
        </span>
      </div>

      <MotionConfig reducedMotion="user">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={pathname}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ type: 'spring', stiffness: 420, damping: 34, opacity: { duration: 0.16 } }}
          >
            {outlet}
          </motion.div>
        </AnimatePresence>
      </MotionConfig>

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
              <Icon name="logout" size={18} />
              Switch player
            </button>
          </div>
        </Sheet>
      )}
    </>
  );
}
