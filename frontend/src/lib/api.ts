import type {
  ApiError,
  ApprovalQueueResponse,
  ApproveAllResult,
  ApproveResult,
  SubmissionDetailResponse,
  ChildDayResponse,
  ChoreResponse,
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

  chores: {
    /** Omit the date for the household's current day. */
    day: (date?: string) =>
      request<ChildDayResponse>(`/api/child/day${date ? `?date=${date}` : ''}`),

    get: (instanceId: string) => request<ChoreResponse>(`/api/chores/${instanceId}`),

    setSubtask: (instanceId: string, subtaskId: string, done: boolean) =>
      request<ChoreResponse>(`/api/chores/${instanceId}/subtasks/${subtaskId}`, {
        method: 'PATCH',
        body: JSON.stringify({ done }),
      }),

    /**
     * The browser must set its own multipart boundary, so this is the one call
     * that cannot go through `request` - that helper forces a JSON content type.
     */
    async addPhoto(instanceId: string, blob: Blob): Promise<{ photo: { id: string } }> {
      const form = new FormData();
      form.append('photo', blob, 'proof.jpg');

      let response: Response;
      try {
        response = await fetch(`${BASE_URL}/api/chores/${instanceId}/photos`, {
          method: 'POST',
          credentials: 'include',
          body: form,
        });
      } catch {
        throw new ApiRequestError('Cannot reach the Chore Quest server.', 'network_unreachable', 0);
      }

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as ApiError | null;
        throw new ApiRequestError(
          body?.error.message ?? 'That photo could not be saved.',
          body?.error.code ?? 'request_failed',
          response.status,
          body?.error.details,
        );
      }
      return (await response.json()) as { photo: { id: string } };
    },

    submit: (instanceId: string) =>
      request<ChoreResponse>(`/api/chores/${instanceId}/submit`, { method: 'POST' }),
  },

  approvals: {
    queue: () => request<ApprovalQueueResponse>('/api/parent/approvals'),

    get: (instanceId: string) =>
      request<SubmissionDetailResponse>(`/api/parent/approvals/${instanceId}`),

    approve: (instanceId: string) =>
      request<ApproveResult>(`/api/parent/approvals/${instanceId}/approve`, { method: 'POST' }),

    approveAll: () =>
      request<ApproveAllResult>('/api/parent/approvals/approve-all', { method: 'POST' }),

    reject: (instanceId: string, note: string) =>
      request<{ ok: true }>(`/api/parent/approvals/${instanceId}/reject`, {
        method: 'POST',
        body: JSON.stringify({ note }),
      }),

    /** The photo endpoint marks a photo seen the first time a parent loads it. */
    photoUrl: (photoId: string) => `${BASE_URL}/api/photos/${photoId}`,
  },
};
