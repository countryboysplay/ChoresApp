import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { AuthProfile, MeResponse } from '@chore-quest/shared';
import { ApiRequestError, api } from './api';
import { resyncPush } from './push';
import { children as mockChildren, parents as mockParents } from '../mock/data';
import { DEFAULT_AVATAR } from '../design/Avatar';

/**
 * Who is signed in, and whether there is a server to ask.
 *
 * 'preview' is the state the GitHub Pages build runs in. That deployment is a
 * design review artifact with no backend behind it, so a hard failure there
 * would break the one way the screens get looked at on a phone. It shows mock
 * profiles and lets navigation through, rather than trapping the reviewer on a
 * login screen that can never succeed.
 *
 * It is decided at BUILD time and never inferred from a failed request. That
 * distinction is the whole point. Until Stage 14 the app fell into preview
 * whenever the API was unreachable, which was harmless only because an app with
 * no cached shell does not open at all without a server. Caching removes that
 * accident: the shell now loads offline, so a runtime fallback would mean
 * anyone who can make the API unreachable - pull the wifi, wait for the laptop
 * to sleep, and after Stage 16, from outside the house - lands inside the app
 * with no PIN. A demo flag is not worth an authentication hole.
 *
 * 'offline' is what a real build does instead: no user, no mock data, no way
 * through, and a screen that says plainly it cannot reach home.
 */
export type AuthMode = 'loading' | 'preview' | 'live' | 'offline';

/**
 * True only in a build made for the Pages demo.
 *
 * Vite replaces `import.meta.env.VITE_PREVIEW_MODE` with a literal when it
 * builds, so a production bundle has `'undefined' === 'true'` compiled in and
 * cannot be argued into preview mode at runtime, whatever the browser does. A
 * function rather than a constant so a test can prove both sides of it.
 */
export function isPreviewBuild(): boolean {
  return import.meta.env.VITE_PREVIEW_MODE === 'true';
}

export type AuthUser = MeResponse['user'];

interface AuthValue {
  mode: AuthMode;
  user: AuthUser | null;
  profiles: AuthProfile[];
  /** Resolves on success; throws ApiRequestError so the PIN pad can read the code. */
  login: (userId: string, pin: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

/** The Stage 2 mock household, shaped like the API's profile list. */
function previewProfiles(): AuthProfile[] {
  return [
    ...mockChildren.map((child) => ({
      id: child.id,
      role: 'child' as const,
      displayName: child.name,
      avatar: child.avatar,
      hasPin: true,
      lifetimePoints: child.lifetimePoints,
    })),
    ...mockParents.map((parent) => ({
      id: parent.id,
      role: 'parent' as const,
      displayName: parent.name,
      avatar: DEFAULT_AVATAR,
      hasPin: true,
      lifetimePoints: null,
    })),
  ];
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<AuthMode>('loading');
  const [user, setUser] = useState<AuthUser | null>(null);
  const [profiles, setProfiles] = useState<AuthProfile[]>([]);

  const load = useCallback(async () => {
    try {
      const me = await api.auth.me();
      setUser(me.user);
      setMode('live');
      // A phone keeps its browser subscription across a sign-out, but the
      // server row is deleted with the session. Without this the browser
      // believes it is subscribed and nothing is ever sent to it. Silent and
      // best-effort; the switch on the inbox screen repairs it either way.
      void resyncPush();
    } catch (error) {
      // The demo build has no backend at all, so any failure means the same
      // thing there - including a 404, which is what a relative /api/ path
      // returns from GitHub Pages. Checked before the unreachable case, which
      // only covers a connection that could not be made.
      if (isPreviewBuild()) {
        setUser(null);
        setProfiles(previewProfiles());
        setMode('preview');
        return;
      }

      if (error instanceof ApiRequestError && error.isUnreachable) {
        // A real build that cannot reach home: the laptop is asleep, the wifi
        // is down, or the server is restarting. Nobody is signed in and nobody
        // gets through - see the note above on why this is not preview mode.
        setUser(null);
        setProfiles([]);
        setMode('offline');
        return;
      }
      // A 401 is the ordinary signed-out case, not a failure.
      setUser(null);
      setMode('live');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // The profile list is public, so it can load before anyone signs in.
  useEffect(() => {
    if (mode !== 'live') return;
    api.auth
      .profiles()
      .then((response) => setProfiles(response.profiles))
      .catch(() => setProfiles([]));
  }, [mode]);

  const login = useCallback(async (userId: string, pin: string): Promise<AuthUser> => {
    await api.auth.login(userId, pin);
    const me = await api.auth.me();
    setUser(me.user);
    // Binds an existing subscription on this phone to the person who just
    // signed in. On a shared tablet that is what moves the reminders across
    // rather than leaving them going to whoever used it last.
    void resyncPush();
    return me.user;
  }, []);

  const logout = useCallback(async () => {
    // Clear locally even if the call fails; the cookie may already be dead, and
    // leaving someone looking at a signed-in shell would be worse.
    try {
      await api.auth.logout();
    } finally {
      setUser(null);
    }
  }, []);

  const value = useMemo<AuthValue>(
    () => ({ mode, user, profiles, login, logout, refresh: load }),
    [mode, user, profiles, login, logout, load],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside an AuthProvider');
  return value;
}
