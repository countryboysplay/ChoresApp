import type {
  ApiError,
  ApprovalQueueResponse,
  NotificationsResponse,
  PushKeyResponse,
  PushStatusResponse,
  ChildRemindersResponse,
  BackupsResponse,
  CertificateResponse,
  ChoreResolution,
  DashboardResponse,
  ScheduleResponse,
  ChoreDefinitionsResponse,
  MembersResponse,
  SettingsResponse,
  ParentBonusResponse,
  ChildRewardsResponse,
  ParentRewardsResponse,
  RedemptionQueueResponse,
  WalletResponse,
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

/**
 * Where the API is.
 *
 * A built app defaults to its own origin, because that is the architecture:
 * the backend serves the frontend so the session cookie is first-party, which
 * Safari on iOS requires and the kids are the ones on phones. Development is
 * the exception - Vite is a separate port there - and VITE_API_BASE_URL still
 * overrides both.
 *
 * Defaulting rather than requiring an empty env var is deliberate. An empty
 * string is not something every shell can even pass: PowerShell deletes a
 * variable set to one, which silently baked localhost:4000 into a production
 * bundle the first time this was tried.
 */
const BASE_URL = (
  import.meta.env.VITE_API_BASE_URL ?? (import.meta.env.DEV ? 'http://localhost:4000' : '')
).replace(/\/$/, '');

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

  rewards: {
    mine: () => request<ChildRewardsResponse>('/api/child/rewards'),

    redeem: (rewardId: string) =>
      request<{ redemption: { id: string; status: string; cost: number } }>(
        `/api/rewards/${rewardId}/redeem`,
        { method: 'POST' },
      ),

    setPreference: (rewardId: string, changes: { isFavorite?: boolean; isPrimaryGoal?: boolean }) =>
      request<{ ok: true }>(`/api/child/rewards/${rewardId}/preferences`, {
        method: 'PUT',
        body: JSON.stringify(changes),
      }),

    catalogue: () => request<ParentRewardsResponse>('/api/parent/rewards'),

    create: (reward: Record<string, unknown>) =>
      request<{ reward: { id: string } }>('/api/parent/rewards', {
        method: 'POST',
        body: JSON.stringify(reward),
      }),

    update: (rewardId: string, changes: Record<string, unknown>) =>
      request<{ ok: true }>(`/api/parent/rewards/${rewardId}`, {
        method: 'PATCH',
        body: JSON.stringify(changes),
      }),

    retire: (rewardId: string) =>
      request<{ ok: true }>(`/api/parent/rewards/${rewardId}`, { method: 'DELETE' }),

    requests: () => request<RedemptionQueueResponse>('/api/parent/redemptions'),

    approveRequest: (id: string) =>
      request<{ result: unknown }>(`/api/parent/redemptions/${id}/approve`, { method: 'POST' }),

    denyRequest: (id: string, note?: string) =>
      request<{ result: unknown }>(`/api/parent/redemptions/${id}/deny`, {
        method: 'POST',
        body: JSON.stringify({ note }),
      }),
  },

  wallet: {
    mine: () => request<WalletResponse>('/api/child/wallet'),
  },

  notifications: {
    list: () => request<NotificationsResponse>('/api/notifications'),

    markRead: (id: string) =>
      request<{ ok: true }>(`/api/notifications/${id}/read`, { method: 'POST' }),

    markAllRead: () =>
      request<{ marked: number }>('/api/notifications/read-all', { method: 'POST' }),
  },

  push: {
    key: () => request<PushKeyResponse>('/api/push/key'),

    /** Registers this browser, or moves it to whoever is signed in now. */
    subscribe: (subscription: { endpoint: string; keys: { p256dh: string; auth: string } }) =>
      request<{ ok: true; configured: boolean }>('/api/push/subscribe', {
        method: 'POST',
        body: JSON.stringify(subscription),
      }),

    unsubscribe: (endpoint: string) =>
      request<{ ok: true; removed: number }>('/api/push/subscribe', {
        method: 'DELETE',
        body: JSON.stringify({ endpoint }),
      }),

    status: () => request<PushStatusResponse>('/api/push/status'),

    /** Which children's reminders are actually reaching a phone. Parent only. */
    children: () => request<ChildRemindersResponse>('/api/parent/push/children'),

    /** The one off switch, on a screen no child can reach. */
    setMuted: (userId: string, muted: boolean) =>
      request<{ ok: true; muted: boolean }>(`/api/parent/push/children/${userId}`, {
        method: 'PATCH',
        body: JSON.stringify({ muted }),
      }),
  },

  backups: {
    list: () => request<BackupsResponse>('/api/parent/backups'),

    /** Restoring is deliberately absent - it is a terminal command. */
    runNow: () =>
      request<{ backup: { id: string; bytes: number; photoCount: number; mirrored: boolean } }>(
        '/api/parent/backups',
        { method: 'POST' },
      ),
  },

  certificate: {
    status: () => request<CertificateResponse>('/api/parent/certificate'),
  },

  dashboard: {
    load: () => request<DashboardResponse>('/api/parent/dashboard'),

    schedule: () => request<ScheduleResponse>('/api/parent/schedule'),

    /** Excuse, carry over, or record as missed. The only way a chore is missed. */
    resolve: (instanceId: string, outcome: ChoreResolution) =>
      request<{ result: { outcome: ChoreResolution; carriedTo: string | null } }>(
        `/api/parent/chores/${instanceId}/resolve`,
        { method: 'POST', body: JSON.stringify({ outcome }) },
      ),
  },

  household: {
    members: () => request<MembersResponse>('/api/parent/members'),

    addChild: (child: Record<string, unknown>) =>
      request<{ member: { id: string } }>('/api/parent/members', {
        method: 'POST',
        body: JSON.stringify(child),
      }),

    updateChild: (userId: string, changes: Record<string, unknown>) =>
      request<{ ok: true }>(`/api/parent/members/${userId}`, {
        method: 'PATCH',
        body: JSON.stringify(changes),
      }),

    setPin: (userId: string, pin: string) =>
      request<{ ok: true; signedOutDevices: number }>(`/api/parent/members/${userId}/pin`, {
        method: 'PUT',
        body: JSON.stringify({ pin }),
      }),

    settings: () => request<SettingsResponse>('/api/parent/settings'),

    saveSettings: (changes: Record<string, unknown>) =>
      request<{ ok: true }>('/api/parent/settings', {
        method: 'PATCH',
        body: JSON.stringify(changes),
      }),

    chores: () => request<ChoreDefinitionsResponse>('/api/parent/chores'),

    createChore: (chore: Record<string, unknown>) =>
      request<{ chore: { id: string } }>('/api/parent/chores', {
        method: 'POST',
        body: JSON.stringify(chore),
      }),

    updateChore: (choreId: string, changes: Record<string, unknown>) =>
      request<{ ok: true }>(`/api/parent/chores/${choreId}`, {
        method: 'PATCH',
        body: JSON.stringify(changes),
      }),

    retireChore: (choreId: string) =>
      request<{ ok: true }>(`/api/parent/chores/${choreId}`, { method: 'DELETE' }),
  },

  bonus: {
    claim: (instanceId: string) =>
      request<{ ok: true }>(`/api/bonus/${instanceId}/claim`, { method: 'POST' }),

    release: (instanceId: string) =>
      request<{ ok: true }>(`/api/bonus/${instanceId}/release`, { method: 'POST' }),

    board: () => request<ParentBonusResponse>('/api/parent/bonus'),

    post: (bonus: Record<string, unknown>) =>
      request<{ bonus: { id: string; definitionId: string } }>('/api/parent/bonus', {
        method: 'POST',
        body: JSON.stringify(bonus),
      }),

    withdraw: (instanceId: string) =>
      request<{ ok: true }>(`/api/parent/bonus/${instanceId}`, { method: 'DELETE' }),
  },
};
