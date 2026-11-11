import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../design/icons';
import { NeonArt } from '../design/neon';
import { useAuth } from '../lib/auth';
import '../design/neon-hud.css';

export function NotFound() {
  // Anyone but a signed-in parent is a kid or about to pick a kid profile: give them the HUD skin.
  const kid = useAuth().user?.role !== 'parent';
  useEffect(() => {
    if (!kid) return;
    document.body.classList.add('kid');
    return () => document.body.classList.remove('kid');
  }, [kid]);

  return (
    <main className="app-shell state-page">
      <NeonArt group="states" name="not-found" className="state-page__art" />
      <h1>That screen does not exist</h1>
      <p className="muted">The link may be from an older version of the app.</p>
      <Link to="/" className="btn btn--primary" style={{ textDecoration: 'none' }}>
        <Icon name="home" size={20} />
        Go to Home
      </Link>
    </main>
  );
}
