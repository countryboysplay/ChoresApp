import type { ApiError, HealthResponse } from '@chore-quest/shared';

const BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000').replace(/\/$/, '');

export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiRequestError';
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
    );
  }

  return (await response.json()) as T;
}

export const api = {
  health: () => request<HealthResponse>('/api/health'),
};
