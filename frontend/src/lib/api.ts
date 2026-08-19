import type {
  ApiError,
  HealthResponse,
  LoginResponse,
  MeResponse,
  ProfilesResponse,
} from '@chore-quest/shared';

const BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000').replace(/\/$/, '');

export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
    /** Whatever the server attached, e.g. attemptsRemaining on a wrong PIN. */
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }

  /** True when the server could not be reached at all, as opposed to refusing. */
  get isUnreachable(): boolean {
    return this.code === 'network_unreachable';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${BASE_URL}${path}`, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
      ...init,
    });
  } catch {
    throw new ApiRequestError('Cannot reach the Chore Quest server.', 'network_unreachable', 0);
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as ApiError | null;
    throw new ApiRequestError(
      body?.error.message ?? 'The server rejected that request.',
      body?.error.code ?? 'request_failed',
      response.status,
      body?.error.details,
    );
  }

  return (await response.json()) as T;
}

export const api = {
  health: () => request<HealthResponse>('/api/health'),

  auth: {
    profiles: () => request<ProfilesResponse>('/api/auth/profiles'),

    login: (userId: string, pin: string) =>
      request<LoginResponse>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ userId, pin }),
      }),

    me: () => request<MeResponse>('/api/auth/me'),

    logout: () => request<{ ok: true }>('/api/auth/logout', { method: 'POST' }),
  },
};
