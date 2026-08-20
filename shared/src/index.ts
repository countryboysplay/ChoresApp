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

export interface RewardItem {
  id: string;
  name: string;
  description: string;
  cost: number;
  category: string;
  icon: string;
  needsApproval: boolean;
  /** YYYY-MM-DD while on cooldown, otherwise null. */
  lockedUntil: string | null;
  isFavorite: boolean;
  isPrimaryGoal: boolean;
  /** True while this child already has a request waiting on a parent. */
  requestPending: boolean;
}

export type RedemptionStatus = 'requested' | 'approved' | 'denied' | 'fulfilled' | 'cancelled';

export interface Redemption {
  id: string;
  rewardName: string;
  status: RedemptionStatus;
  cost: number;
  requestedAt: string;
  decidedAt: string | null;
  note: string | null;
}

export interface ChildRewardsResponse {
  spendablePoints: number;
  rewards: RewardItem[];
  redemptions: Redemption[];
}

export interface LedgerEntry {
  id: string;
  delta: number;
  reason: string;
  label: string;
  at: string;
}

export interface WalletResponse {
  spendablePoints: number;
  lifetimePoints: number;
  spentPoints: number;
  history: LedgerEntry[];
  cashOut: {
    /** False until an owner sets both the rate and the minimum in Settings. */
    configured: boolean;
    pointsPerDollar: number | null;
    minimumPoints: number | null;
    weeklyCapCents: number;
    usedThisWeekCents: number;
    weekStart: string;
    /** Null while unconfigured; never a guessed figure. */
    availableCents: number | null;
  };
}

/** The catalogue as a parent manages it, including retired entries. */
export interface ManagedReward {
  id: string;
  name: string;
  description: string;
  cost: number;
  category: string;
  icon: string;
  needsApproval: boolean;
  isActive: boolean;
  lockedUntil: string | null;
}

export interface ParentRewardsResponse {
  rewards: ManagedReward[];
}

export interface RewardRequest {
  id: string;
  status: RedemptionStatus;
  cost: number;
  rewardName: string;
  rewardIcon: string;
  child: { id: string; displayName: string };
  requestedAt: string;
  decidedAt: string | null;
  note: string | null;
}

export interface RedemptionQueueResponse {
  pending: RewardRequest[];
  recent: RewardRequest[];
}

/** A bonus chore as a parent sees it on the board. */
export interface BonusPosting {
  id: string;
  definitionId: string;
  name: string;
  icon: string;
  category: string | null;
  points: number;
  choreDate: string;
  status: ChoreStatus;
  expiresAt: string | null;
  claimedAt: string | null;
  /** Display name of whoever holds it, or null while it is on offer. */
  claimedBy: string | null;
  subtaskCount: number;
}

export interface ParentBonusResponse {
  bonus: BonusPosting[];
}

export interface HouseholdMember {
  id: string;
  role: Role;
  displayName: string;
  avatar: unknown;
  sortOrder: number;
  isActive: boolean;
  hasPin: boolean;
  lastLoginAt: string | null;
  /** Children only; null for parents. */
  balance: number | null;
  signedInDevices: number;
  /** False for parents: those are managed from the laptop's terminal. */
  managedHere: boolean;
}

export interface MembersResponse {
  members: HouseholdMember[];
}

export interface ChoreSchedule {
  id: string;
  assignedTo: string;
  assignedToName: string;
  recurrence: 'daily' | 'weekly';
  /** ISO weekdays, 1 = Monday .. 7 = Sunday. */
  daysOfWeek: number[];
  startsOn: string;
  endsOn: string | null;
  isActive: boolean;
}

export interface ChoreDefinition {
  id: string;
  name: string;
  icon: string;
  points: number;
  category: string | null;
  instructions: string | null;
  isActive: boolean;
  subtasks: { id: string; title: string; instruction: string | null }[];
  schedules: ChoreSchedule[];
}

export interface ChoreDefinitionsResponse {
  chores: ChoreDefinition[];
}

export interface HouseholdSettings {
  corePointValue: number;
  punctualityBonusPoints: number;
  /** Both null until an owner sets them; see DECISIONS.md. */
  pointsPerDollar: number | null;
  minimumCashOutPoints: number | null;
  /** Fixed by the specification at $40. Shown, not editable. */
  weeklyCashOutCapCents: number;
  reminderTime: string;
  escalationTime: string;
  timezone: string;
  cashOutConfigured: boolean;
}

export interface SettingsResponse {
  settings: HouseholdSettings;
}

/** A chore from a past day that nobody finished and no parent has decided on. */
export interface UnresolvedChore {
  id: string;
  choreName: string;
  choreIcon: string;
  choreDate: string;
  points: number;
  status: ChoreStatus;
  child: { id: string; displayName: string };
}

export type ChoreResolution = 'excused' | 'missed' | 'carried_over';

export interface DashboardResponse {
  today: string;
  weekStart: string;
  children: {
    id: string;
    displayName: string;
    avatar: unknown;
    balance: number;
    weekPoints: number;
  }[];
  counts: {
    pendingApprovals: number;
    pendingRewardRequests: number;
    choresDoneThisWeek: number;
    choresDueThisWeek: number;
  };
  needsAttention: UnresolvedChore[];
  weekActivity: {
    childId: string;
    date: string;
    approved: number;
    missed: number;
    points: number;
  }[];
}

export interface ScheduleEntry {
  id: string;
  choreId: string;
  choreName: string;
  choreIcon: string;
  points: number;
  child: { id: string; displayName: string };
  recurrence: 'daily' | 'weekly';
  /** Empty for a daily chore, which applies to every day. */
  daysOfWeek: number[];
  startsOn: string;
  endsOn: string | null;
}

export interface ScheduleResponse {
  schedules: ScheduleEntry[];
}

export type NotificationKind =
  | 'chore_reminder'
  | 'chore_escalation'
  | 'chore_approved'
  | 'chore_rejected'
  | 'reward_decided'
  | 'bonus_posted'
  | 'general';

export interface InboxNotification {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  tone: 'done' | 'waiting' | 'late' | 'info';
  /** Hash-router path, because the frontend uses HashRouter. */
  deepLink: string | null;
  read: boolean;
  at: string;
}

export interface NotificationsResponse {
  unread: number;
  notifications: InboxNotification[];
}

/**
 * Web Push.
 *
 * The VAPID public key is served rather than built into the bundle: the Pages
 * preview is built with no backend behind it and would carry a key matching
 * nothing. `configured` is false until all three VAPID values are set on the
 * laptop, and the app says so plainly rather than offering a switch that does
 * nothing.
 */
export interface PushKeyResponse {
  configured: boolean;
  publicKey: string | null;
}

export interface PushStatusResponse {
  configured: boolean;
  /** Phones subscribed across the whole household. Never endpoints. */
  devices: number;
}

/**
 * Per-child reminder state, for the parent app.
 *
 * The child app has no off switch, but a browser always does - notification
 * permission belongs to whoever holds the phone and Chrome can take it back at
 * any time. Since that cannot be prevented, it is reported: a child whose
 * reminders stop reaching them shows up here rather than going quiet unnoticed.
 */
export interface ChildReminderState {
  id: string;
  displayName: string;
  /** Phones currently subscribed for this child. */
  devices: number;
  /** A parent turned reminders off deliberately. The inbox still fills. */
  mutedByParent: boolean;
  /** False when muted, or when no phone is subscribed at all. */
  remindersReaching: boolean;
}

export interface ChildRemindersResponse {
  configured: boolean;
  children: ChildReminderState[];
}

/**
 * Backups.
 *
 * `mirrorConnected` is reported even when false, and especially then. A
 * household that believes it has an off-laptop copy and does not is worse off
 * than one that knows it does not, because the first will never go looking for
 * the drive.
 */
export interface BackupRecord {
  id: string;
  status: 'running' | 'ok' | 'failed';
  kind: 'scheduled' | 'manual';
  at: string;
  finishedAt: string | null;
  bytes: number | null;
  photoCount: number | null;
  mirrored: boolean;
  error: string | null;
}

export interface BackupsResponse {
  /** A removable-drive path is set in the environment. */
  mirrorConfigured: boolean;
  /** That path exists right now, i.e. the drive is plugged in. */
  mirrorConnected: boolean;
  retention: { daily: number; weekly: number };
  lastGood: BackupRecord | null;
  backups: BackupRecord[];
}
