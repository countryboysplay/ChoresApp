import { Navigate, Outlet, useLocation } from 'react-router-dom';
import type { Role } from '@chore-quest/shared';
import { useAuth } from '../lib/auth';

/**
 * Keeps a section of the app behind a sign-in.
 *
 * This is a convenience, not the security boundary. The API decides what any
 * request is allowed to see, and a guard that only lives in the browser can be
 * stepped around by editing the URL. What it buys is that someone who is not
 * signed in lands on the profile picker instead of a screen full of empty
 * placeholders and failed requests.
 *
 * In preview mode there is no server to sign in to, so it lets everything
 * through - that build is the design review, running on mock data.
 */
export function RequireRole({ role }: { role: Role }) {
  const { mode, user } = useAuth();
  const location = useLocation();

  if (mode === 'loading') {
    return (
      <main className="screen">
        <p aria-live="polite" style={{ textAlign: 'center', marginTop: 'var(--space-7)' }}>
          Loading&hellip;
        </p>
      </main>
    );
  }

  if (mode === 'preview') return <Outlet />;

  if (!user) {
    // `state` so a future sign-in can return them to where they were headed.
    return <Navigate to="/profiles" replace state={{ from: location.pathname }} />;
  }

  if (user.role !== role) {
    return <Navigate to={user.role === 'parent' ? '/parent' : '/child/home'} replace />;
  }

  return <Outlet />;
}
