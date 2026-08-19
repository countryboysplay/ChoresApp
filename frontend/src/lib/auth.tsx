import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { AuthProfile, MeResponse } from '@chore-quest/shared';
import { ApiRequestError, api } from './api';
import { children as mockChildren, parents as mockParents } from '../mock/data';
import { DEFAULT_AVATAR } from '../design/Avatar';

/**
 * Who is signed in, and whether there is a server to ask.
 *
 * 'preview' is the state the GitHub Pages build runs in. That deployment is a
 * design review artifact with no backend behind it, so a hard failure there
 * would break the one way the screens get looked at on a phone. When the API
 * cannot be reached the app falls back to mock profiles and lets navigation
 * through, rather than trapping the reviewer on a login screen that can never
 * succeed.
 *
 * It is deliberately not a way to bypass the login. Nothing sensitive exists in
 * preview mode - there is no household data to reach, because there is no
 * server holding any.
 */
export type AuthMode = 'loading' | 'preview' | 'live';

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
    } catch (error) {
      if (error instanceof ApiRequestError && error.isUnreachable) {
        // No server. This is the Pages preview, or the laptop is asleep.
        setUser(null);
        setProfiles(previewProfiles());
        setMode('preview');
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
