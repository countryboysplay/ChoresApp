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

export interface Subtask {
  id: string;
  position: number;
  title: string;
  instruction: string | null;
  done: boolean;
}

export interface Chore {
  id: string;
  name: string;
  /** Icon name from the frontend's code-drawn set. */
  icon: string;
  kind: ChoreKind;
  category: string | null;
  status: ChoreStatus;
  /** Snapshotted when the chore was created, not the definition's current value. */
  points: number;
  /** The household day this belongs to, YYYY-MM-DD. */
  choreDate: string;
  rejectionNote: string | null;
  /** Bonus chores only. ISO 8601. */
  expiresAt: string | null;
  claimed: boolean;
  subtasks: Subtask[];
}

export interface ChildSummary {
  spendablePoints: number;
  lifetimePoints: number;
  streakDays: number;
  recentWin: { label: string; delta: number; at: string } | null;
}

export interface ChildDayResponse {
  /** The day asked for. */
  date: string;
  /** The household's current day, which may be later than `date`. */
  today: string;
  summary: ChildSummary;
  core: Chore[];
  /** Bonus chores this child has claimed. */
  bonus: Chore[];
  /** Bonus chores still on offer to anyone. */
  availableBonus: Chore[];
}

export interface ChoreResponse {
  chore: Chore;
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

/** One chore waiting for, or just finished with, a parent's review. */
export interface Submission {
  id: string;
  status: ChoreStatus;
  choreDate: string;
  choreName: string;
  choreIcon: string;
  choreKind: ChoreKind;
  child: { id: string; displayName: string; avatar: unknown };
  submittedAt: string | null;
  reviewedAt: string | null;
  pointsValue: number;
  /** Null until approved. Includes the punctuality bonus when one applied. */
  pointsAwarded: number | null;
  /** Frozen when the child submitted, not recomputed at review time. */
  punctual: boolean | null;
  rejectionNote: string | null;
  subtasksTotal: number;
  subtasksDone: number;
  photos: { id: string; viewed: boolean }[];
}

export interface ApprovalQueueResponse {
  pending: Submission[];
  /** Reviewed today, for the queue's second tab. */
  reviewed: Submission[];
}

export interface SubmissionDetail {
  id: string;
  status: ChoreStatus;
  choreDate: string;
  choreName: string;
  choreIcon: string;
  child: { id: string; displayName: string; avatar: unknown };
  submittedAt: string | null;
  pointsValue: number;
  punctual: boolean | null;
  /** What the bonus would add, already zero when the submission was late. */
  bonusPoints: number;
  rejectionNote: string | null;
  subtasks: { id: string; title: string; instruction: string | null; done: boolean }[];
  photos: { id: string; viewed: boolean }[];
}

export interface SubmissionDetailResponse {
  submission: SubmissionDetail;
}

export interface ApproveResult {
  result: { awarded: number; bonus: number };
}

export interface ApproveAllResult {
  approved: number;
  skipped: { id: string; reason: string }[];
}
