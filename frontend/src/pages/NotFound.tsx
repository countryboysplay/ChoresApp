import { Link } from 'react-router-dom';

export function NotFound() {
  return (
    <main className="app-shell">
      <h1>That screen does not exist</h1>
      <p className="muted">The link may be from an older version of the app.</p>
      <Link to="/" style={{ color: 'var(--gold)', fontWeight: 700 }}>
        Go to Home
      </Link>
    </main>
  );
}
