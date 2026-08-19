/**
 * Shared API contract between the frontend and the Windows backend.
 *
 * This package is intentionally TYPE-ONLY: everything here is erased at compile
 * time, so neither app needs a build step for it and the compiled backend has no
 * runtime dependency on the workspace. Runtime helpers must live in their own app.
 */

export const HOUSEHOLD_TIMEZONE = 'America/Chicago' as const;

export type Role = 'parent' | 'child';

export type ChoreKind = 'core' | 'bonus';

export type ChoreStatus =
  | 'not_started'
  | 'in_progress'
  | 'submitted'
  | 'approved'
  | 'rejected'
  | 'missed'
  | 'excused'
  | 'carried_over';

export type DatabaseHealth = 'not_configured' | 'connected' | 'unreachable';

export interface HealthResponse {
  status: 'ok';
  version: string;
  environment: string;
  uptimeSeconds: number;
  household: {
    timezone: string;
    /** Local wall clock, e.g. 2026-08-18T20:45:00 */
    localTime: string;
    /** The chore day the household is currently in, YYYY-MM-DD */
    choreDate: string;
  };
  database: DatabaseHealth;
}

export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

/** One entry on the "choose your hero" screen, before anyone is signed in. */
export interface AuthProfile {
  id: string;
  role: Role;
  displayName: string;
  /** AvatarConfig for children, null for parents. */
  avatar: unknown;
  /** False until a parent has set this person's PIN with the backend CLI. */
  hasPin: boolean;
  /**
   * Children only; null for parents. Present because the approved "choose your
   * hero" screen shows a level and a lifetime total on each card, and this
   * endpoint is read before anyone signs in.
   *
   * It is a deliberate, bounded disclosure: anyone who can reach the API already
   * sees the household's first names, which the screen cannot work without.
   * Nothing else about a child is served unauthenticated - no balance, no chore
   * history, no photos.
   */
  lifetimePoints: number | null;
}

export interface ProfilesResponse {
  profiles: AuthProfile[];
}

export interface LoginRequest {
  userId: string;
  pin: string;
}

export interface LoginResponse {
  user: { id: string; role: Role };
  /** ISO 8601. Sessions extend on use, so this moves. */
  expiresAt: string;
}

export interface MeResponse {
  user: { id: string; role: Role; displayName: string; avatar: unknown };
  expiresAt: string;
}

/** Error codes the PIN screen has to tell apart. */
export const AUTH_ERROR = {
  /** Wrong PIN. `details.attemptsRemaining` counts down to the first lockout. */
  invalidPin: 'invalid_pin',
  /** Too many wrong tries. `details.retryAfterSeconds` says how long to wait. */
  pinLocked: 'pin_locked',
  notAuthenticated: 'not_authenticated',
  forbidden: 'forbidden',
} as const;

export interface InvalidPinDetails {
  attemptsRemaining: number;
}

export interface PinLockedDetails {
  retryAfterSeconds: number;
}
