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
