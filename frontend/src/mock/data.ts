/**
 * STAGE 2 MOCK DATA - display only.
 *
 * No database, no API. Names are the generic placeholders the spec requires
 * (Child 1, Child 2, Parent 1, Parent 2); no real household names appear here.
 *
 * Two owner-configured values are deliberately left NULL because the spec
 * forbids inventing them: the points-to-cash conversion rate and the minimum
 * cash-out threshold. The screens therefore render their "not configured" state,
 * which is exactly what the app must do until Settings is filled in.
 *
 * `corePointValue` and `punctualityBonus` carry demo numbers so the screens can
 * be reviewed; they are parent settings in Stage 10, not defaults.
 */
import { DEFAULT_AVATAR, type AvatarConfig } from '../design/Avatar';
import type { IconName } from '../design/icons';

export type ChoreStatus =
  | 'not_started'
  | 'in_progress'
  | 'submitted'
  | 'approved'
  | 'rejected'
  | 'carried_over'
  | 'excused'
  | 'missed';

export interface Subtask {
  id: string;
  title: string;
  instruction?: string;
  done: boolean;
}

export interface Chore {
  id: string;
  name: string;
  icon: IconName;
  kind: 'core' | 'bonus';
  points: number;
  status: ChoreStatus;
  subtasks: Subtask[];
  rejectionNote?: string;
  claimedBy?: string;
  expiresInMinutes?: number;
  category?: string;
}

export interface Child {
  id: string;
  name: string;
  avatar: AvatarConfig;
  spendablePoints: number;
  lifetimePoints: number;
  weekPoints: number;
  streakDays: number;
  approvedChores: number;
  badges: number;
  todayChoreId: string;
}

export interface RewardItem {
  id: string;
  name: string;
  description: string;
  cost: number;
  category: 'Screen Time' | 'Food' | 'Activities' | 'Privileges';
  icon: IconName;
  needsApproval: boolean;
  lockedUntil?: string;
  favorite?: boolean;
  primaryGoal?: boolean;
}

export const settings = {
  corePointValue: 10, // demo value - parent setting in Stage 10
  punctualityBonus: 2, // demo value - parent setting in Stage 10
  pointsPerDollar: null as number | null, // never invented; owner configures
  minimumCashOutPoints: null as number | null, // never invented; owner configures
  weeklyCashOutCapDollars: 40, // fixed by spec
  cashOutPresets: [5, 10, 15, 20, 25, 30, 35, 40], // fixed by spec
  reminderTime: '8:45 PM',
  escalationTime: '11:00 PM',
  timezone: 'America/Chicago',
};

export const parents = [
  { id: 'parent-1', name: 'Parent 1' },
  { id: 'parent-2', name: 'Parent 2' },
];

export const children: Child[] = [
  {
    id: 'child-1',
    name: 'Child 1',
    avatar: { ...DEFAULT_AVATAR, hair: 'spiky', shirt: '#00c853', background: '#407cfe' },
    spendablePoints: 240,
    lifetimePoints: 1310,
    weekPoints: 84,
    streakDays: 6,
    approvedChores: 118,
    badges: 7,
    todayChoreId: 'core-kitchen',
  },
  {
    id: 'child-2',
    name: 'Child 2',
    avatar: { ...DEFAULT_AVATAR, hair: 'curly', skin: '#8d5524', shirt: '#ffc107', background: '#00c853' },
    spendablePoints: 95,
    lifetimePoints: 980,
    weekPoints: 62,
    streakDays: 2,
    approvedChores: 91,
    badges: 5,
    todayChoreId: 'core-bathroom',
  },
];

export const coreChores: Chore[] = [
  {
    id: 'core-kitchen',
    name: 'Kitchen Cleaning',
    icon: 'kitchen',
    kind: 'core',
    points: settings.corePointValue,
    status: 'in_progress',
    subtasks: [
      { id: 's1', title: 'Wash dishes', instruction: 'Rinse first, then load or hand wash.', done: true },
      { id: 's2', title: 'Clean countertops', done: true },
      { id: 's3', title: 'Clean stove', instruction: 'Wipe the burners and the front.', done: true },
      { id: 's4', title: 'Clear and clean kitchen table', done: false },
      { id: 's5', title: 'Clear and clean coffee bar', done: false },
      { id: 's6', title: 'Sweep floor', done: false },
      { id: 's7', title: 'Mop floor', instruction: 'Sweep first or the mop just moves crumbs.', done: false },
    ],
  },
  {
    id: 'core-bathroom',
    name: 'Bathroom',
    icon: 'bathroom',
    kind: 'core',
    points: settings.corePointValue,
    status: 'rejected',
    rejectionNote: 'The mirror still has spots and the trash was not taken out. Please redo both.',
    subtasks: [
      { id: 'b1', title: 'Wipe sink and counter', done: false },
      { id: 'b2', title: 'Clean mirror', done: false },
      { id: 'b3', title: 'Scrub toilet', done: false },
      { id: 'b4', title: 'Empty trash', done: false },
      { id: 'b5', title: 'Sweep floor', done: false },
    ],
  },
];

export const bonusChores: Chore[] = [
  {
    id: 'bonus-garage',
    name: 'Sweep the garage',
    icon: 'floors',
    kind: 'bonus',
    points: 25,
    status: 'not_started',
    category: 'Yard',
    expiresInMinutes: 320,
    subtasks: [
      { id: 'g1', title: 'Move loose items off the floor', done: false },
      { id: 'g2', title: 'Sweep front to back', done: false },
      { id: 'g3', title: 'Bag and bin the debris', done: false },
    ],
  },
  {
    id: 'bonus-laundry',
    name: 'Fold and put away laundry',
    icon: 'laundry',
    kind: 'bonus',
    points: 18,
    status: 'not_started',
    category: 'Laundry',
    expiresInMinutes: 95,
    subtasks: [
      { id: 'l1', title: 'Fold everything in the basket', done: false },
      { id: 'l2', title: 'Put clothes in the right drawers', done: false },
    ],
  },
  {
    id: 'bonus-trash',
    name: 'Take out all trash bins',
    icon: 'trash',
    kind: 'bonus',
    points: 15,
    status: 'not_started',
    category: 'Kitchen',
    claimedBy: 'Child 2',
    expiresInMinutes: 240,
    subtasks: [
      { id: 't1', title: 'Empty every room bin', done: false },
      { id: 't2', title: 'Roll bins to the curb', done: false },
    ],
  },
  {
    id: 'bonus-yard',
    name: 'Rake the front yard',
    icon: 'yard',
    kind: 'bonus',
    points: 30,
    status: 'not_started',
    category: 'Yard',
    expiresInMinutes: 1500,
    subtasks: [
      { id: 'y1', title: 'Rake leaves into piles', done: false },
      { id: 'y2', title: 'Bag the piles', done: false },
    ],
  },
];

export const rewards: RewardItem[] = [
  {
    id: 'r1',
    name: 'One hour of extra screen time',
    description: 'Any device, used the same day.',
    cost: 120,
    category: 'Screen Time',
    icon: 'screen',
    needsApproval: true,
    favorite: true,
    primaryGoal: true,
  },
  {
    id: 'r2',
    name: 'Pick dinner for the family',
    description: 'You choose what everyone eats.',
    cost: 200,
    category: 'Food',
    icon: 'food',
    needsApproval: true,
    favorite: true,
  },
  {
    id: 'r3',
    name: 'Movie night pick',
    description: 'You choose the movie and the snack.',
    cost: 150,
    category: 'Activities',
    icon: 'activity',
    needsApproval: true,
  },
  {
    id: 'r4',
    name: 'Stay up 30 minutes later',
    description: 'Weekends only.',
    cost: 90,
    category: 'Privileges',
    icon: 'clock',
    needsApproval: true,
    lockedUntil: 'Resets Saturday',
  },
  {
    id: 'r5',
    name: 'Friend over for the afternoon',
    description: 'Parent confirms the day and time.',
    cost: 300,
    category: 'Activities',
    icon: 'user',
    needsApproval: true,
  },
];

export interface Achievement {
  id: string;
  name: string;
  description: string;
  category: 'Chores' | 'Streaks' | 'Bonus Chores' | 'Points' | 'Rewards';
  icon: IconName;
  earned: boolean;
  progress?: { current: number; target: number };
}

export const achievements: Achievement[] = [
  { id: 'a1', name: 'First Clean', description: 'Complete your first chore.', category: 'Chores', icon: 'check', earned: true },
  { id: 'a2', name: 'Century Club', description: 'Get 100 chores approved.', category: 'Chores', icon: 'trophy', earned: true },
  { id: 'a3', name: 'Week Warrior', description: 'Hold a 7 day streak.', category: 'Streaks', icon: 'flame', earned: false, progress: { current: 6, target: 7 } },
  { id: 'a4', name: 'Month Machine', description: 'Hold a 30 day streak.', category: 'Streaks', icon: 'flame', earned: false, progress: { current: 6, target: 30 } },
  { id: 'a5', name: 'Bonus Hunter', description: 'Finish 10 bonus chores.', category: 'Bonus Chores', icon: 'star', earned: true },
  { id: 'a6', name: 'Point Collector', description: 'Earn 1,000 lifetime points.', category: 'Points', icon: 'coin', earned: true },
  { id: 'a7', name: 'Big Spender', description: 'Redeem 5 rewards.', category: 'Rewards', icon: 'gift', earned: false, progress: { current: 3, target: 5 } },
];

export interface Notice {
  id: string;
  title: string;
  body: string;
  minutesAgo: number;
  tone: 'done' | 'waiting' | 'late' | 'info';
  unread: boolean;
}

export const childNotices: Notice[] = [
  { id: 'n1', title: 'Chore approved', body: 'Kitchen Cleaning earned you 12 points.', minutesAgo: 42, tone: 'done', unread: true },
  { id: 'n2', title: 'New bonus chore', body: 'Rake the front yard is worth 30 points.', minutesAgo: 90, tone: 'info', unread: true },
  { id: 'n3', title: 'Reward approved', body: 'Movie night pick is yours.', minutesAgo: 400, tone: 'done', unread: false },
  { id: 'n4', title: 'Chore needs fixing', body: 'Bathroom was sent back with a note.', minutesAgo: 1500, tone: 'late', unread: false },
];

export interface AttentionItem {
  id: string;
  kind: 'approval' | 'missed' | 'cash_out' | 'reward';
  child: string;
  title: string;
  detail: string;
  minutesAgo: number;
  urgency: 'high' | 'medium' | 'low';
}

export const needsAttention: AttentionItem[] = [
  { id: 'at1', kind: 'approval', child: 'Child 1', title: 'Kitchen Cleaning submitted', detail: '7 of 7 subtasks, 1 photo', minutesAgo: 12, urgency: 'high' },
  { id: 'at2', kind: 'reward', child: 'Child 2', title: 'Reward request: Movie night pick', detail: '150 points reserved', minutesAgo: 35, urgency: 'high' },
  { id: 'at3', kind: 'missed', child: 'Child 2', title: 'Bathroom not finished yesterday', detail: 'Excuse, carry over, or mark missed', minutesAgo: 720, urgency: 'medium' },
  { id: 'at4', kind: 'cash_out', child: 'Child 1', title: 'Cash-out request', detail: 'Waiting on conversion rate setup', minutesAgo: 900, urgency: 'low' },
];

export interface Submission {
  id: string;
  child: string;
  choreName: string;
  choreIcon: IconName;
  points: number;
  minutesAgo: number;
  subtasksDone: number;
  subtasksTotal: number;
  photos: number;
}

export const pendingSubmissions: Submission[] = [
  { id: 'sub1', child: 'Child 1', choreName: 'Kitchen Cleaning', choreIcon: 'kitchen', points: 12, minutesAgo: 12, subtasksDone: 7, subtasksTotal: 7, photos: 2 },
  { id: 'sub2', child: 'Child 1', choreName: 'Sweep the garage', choreIcon: 'floors', points: 25, minutesAgo: 48, subtasksDone: 3, subtasksTotal: 3, photos: 1 },
  { id: 'sub3', child: 'Child 2', choreName: 'Take out all trash bins', choreIcon: 'trash', points: 15, minutesAgo: 95, subtasksDone: 2, subtasksTotal: 2, photos: 1 },
];

/** Seven day activity per child: approved / missed / points. */
export const weekActivity: Record<string, { day: string; approved: number; missed: number; points: number }[]> = {
  'child-1': [
    { day: 'Mon', approved: 1, missed: 0, points: 12 },
    { day: 'Tue', approved: 2, missed: 0, points: 30 },
    { day: 'Wed', approved: 1, missed: 0, points: 10 },
    { day: 'Thu', approved: 1, missed: 0, points: 12 },
    { day: 'Fri', approved: 0, missed: 1, points: 0 },
    { day: 'Sat', approved: 2, missed: 0, points: 20 },
    { day: 'Sun', approved: 0, missed: 0, points: 0 },
  ],
  'child-2': [
    { day: 'Mon', approved: 1, missed: 0, points: 10 },
    { day: 'Tue', approved: 0, missed: 1, points: 0 },
    { day: 'Wed', approved: 1, missed: 0, points: 12 },
    { day: 'Thu', approved: 1, missed: 0, points: 25 },
    { day: 'Fri', approved: 1, missed: 0, points: 10 },
    { day: 'Sat', approved: 0, missed: 1, points: 0 },
    { day: 'Sun', approved: 0, missed: 0, points: 0 },
  ],
};

/** Streak calendar: last 28 days. 'done' | 'missed' | 'paused' | 'none' */
export const streakCalendar: ('done' | 'missed' | 'paused' | 'none')[] = [
  'done', 'done', 'missed', 'done', 'done', 'done', 'none',
  'done', 'done', 'done', 'paused', 'paused', 'done', 'none',
  'done', 'missed', 'done', 'done', 'done', 'done', 'none',
  'done', 'done', 'done', 'done', 'done', 'done', 'none',
];

export const ledger = [
  { id: 'le1', label: 'Kitchen Cleaning approved', delta: 12, minutesAgo: 42 },
  { id: 'le2', label: 'Punctuality bonus', delta: 2, minutesAgo: 42 },
  { id: 'le3', label: 'Sweep the garage approved', delta: 25, minutesAgo: 1400 },
  { id: 'le4', label: 'Movie night pick redeemed', delta: -150, minutesAgo: 2900 },
  { id: 'le5', label: 'Bathroom approved', delta: 10, minutesAgo: 4300 },
];
