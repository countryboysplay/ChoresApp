/**
 * The badges a household can earn, and the one number each one watches.
 *
 * Defined here rather than seeded by a migration because a badge is a rule, not
 * a row: changing what "Week Warrior" means should be a change to code that can
 * be read in a diff, and the table is a projection of this list. `code` is the
 * identity - the uuid is generated once and never referred to by name - so a
 * badge can be renamed or redescribed without a child losing it.
 *
 * Every measure is computed from what the household already records. Nothing
 * here needs a counter kept up to date on the side, which is what makes the
 * whole thing reconcilable: see service.ts.
 */
export interface AchievementStats {
  coreApproved: number;
  bonusApproved: number;
  punctual: number;
  lifetimePoints: number;
  rewardsRedeemed: number;
  streakDays: number;
  /** Household weeks with a core chore on all seven days, every one approved. */
  perfectWeeks: number;
  /** Approved chores sent in at least two hours before the evening reminder. */
  speedRuns: number;
  /** Days with two or more core chores, all sent in on time and approved. */
  cleanSweeps: number;
  /** Weeks (this one or last) the family hit its XP goal with this child's help. */
  teamGoalWeeks: number;
}

export interface AchievementDefinition {
  code: string;
  name: string;
  description: string;
  category: 'Chores' | 'Streaks' | 'On time' | 'Bonus chores' | 'Points' | 'Rewards' | 'Team';
  icon: string;
  /** What counts towards it, from the stats above. */
  measure: (stats: AchievementStats) => number;
  /** The number that earns it. One for a badge with no meter. */
  target: number;
}

/**
 * A streak badge measures the streak running now, and `earned_at` is never
 * cleared once set. So the meter can fall back to nothing the day a streak
 * breaks while the badge stays earned, which is the right way round: a badge is
 * a record of having done it, not a status that can be taken away.
 */
export const ACHIEVEMENTS: AchievementDefinition[] = [
  {
    code: 'first-chore',
    name: 'First Clean',
    description: 'Get your first chore approved.',
    category: 'Chores',
    icon: 'check',
    measure: (s) => s.coreApproved,
    target: 1,
  },
  {
    code: 'chores-10',
    name: 'Getting Going',
    description: 'Get 10 chores approved.',
    category: 'Chores',
    icon: 'missions',
    measure: (s) => s.coreApproved,
    target: 10,
  },
  {
    code: 'chores-50',
    name: 'Old Hand',
    description: 'Get 50 chores approved.',
    category: 'Chores',
    icon: 'medal',
    measure: (s) => s.coreApproved,
    target: 50,
  },
  {
    code: 'chores-100',
    name: 'Century Club',
    description: 'Get 100 chores approved.',
    category: 'Chores',
    icon: 'trophy',
    measure: (s) => s.coreApproved,
    target: 100,
  },

  {
    code: 'streak-3',
    name: 'Three in a Row',
    description: 'Finish everything three days running.',
    category: 'Streaks',
    icon: 'flame',
    measure: (s) => s.streakDays,
    target: 3,
  },
  {
    code: 'streak-7',
    name: 'Week Warrior',
    description: 'Hold a seven day streak.',
    category: 'Streaks',
    icon: 'flame',
    measure: (s) => s.streakDays,
    target: 7,
  },
  {
    code: 'streak-14',
    name: 'Fortnight',
    description: 'Hold a fourteen day streak.',
    category: 'Streaks',
    icon: 'flame',
    measure: (s) => s.streakDays,
    target: 14,
  },
  {
    code: 'streak-30',
    name: 'Month Machine',
    description: 'Hold a thirty day streak.',
    category: 'Streaks',
    icon: 'flame',
    measure: (s) => s.streakDays,
    target: 30,
  },

  {
    code: 'on-time-5',
    name: 'Beat the Clock',
    description: 'Send in five chores before the evening reminder.',
    category: 'On time',
    icon: 'clock',
    measure: (s) => s.punctual,
    target: 5,
  },
  {
    code: 'on-time-25',
    name: 'Never Late',
    description: 'Send in twenty-five chores before the evening reminder.',
    category: 'On time',
    icon: 'clock',
    measure: (s) => s.punctual,
    target: 25,
  },

  {
    code: 'bonus-1',
    name: 'Volunteer',
    description: 'Finish your first bonus chore.',
    category: 'Bonus chores',
    icon: 'star',
    measure: (s) => s.bonusApproved,
    target: 1,
  },
  {
    code: 'bonus-10',
    name: 'Bonus Hunter',
    description: 'Finish ten bonus chores.',
    category: 'Bonus chores',
    icon: 'star',
    measure: (s) => s.bonusApproved,
    target: 10,
  },

  {
    code: 'points-100',
    name: 'Piggy Bank',
    description: 'Earn 100 points altogether.',
    category: 'Points',
    icon: 'coin',
    measure: (s) => s.lifetimePoints,
    target: 100,
  },
  {
    code: 'points-1000',
    name: 'Point Collector',
    description: 'Earn 1,000 points altogether.',
    category: 'Points',
    icon: 'coin',
    measure: (s) => s.lifetimePoints,
    target: 1000,
  },
  {
    code: 'points-5000',
    name: 'Treasury',
    description: 'Earn 5,000 points altogether.',
    category: 'Points',
    icon: 'chest',
    measure: (s) => s.lifetimePoints,
    target: 5000,
  },

  {
    code: 'reward-1',
    name: 'Worth It',
    description: 'Spend points on your first reward.',
    category: 'Rewards',
    icon: 'gift',
    measure: (s) => s.rewardsRedeemed,
    target: 1,
  },
  {
    code: 'reward-5',
    name: 'Big Spender',
    description: 'Spend points on five rewards.',
    category: 'Rewards',
    icon: 'gift',
    measure: (s) => s.rewardsRedeemed,
    target: 5,
  },

  {
    code: 'perfect-week',
    name: 'Perfect Week',
    description: 'Get every core chore approved, every day from Monday to Sunday.',
    category: 'Streaks',
    icon: 'calendar-check',
    measure: (s) => s.perfectWeeks,
    target: 1,
  },
  {
    code: 'speed-run',
    name: 'Speed Run',
    description: 'Send in ten chores at least two hours before the evening reminder.',
    category: 'On time',
    icon: 'timer',
    measure: (s) => s.speedRuns,
    target: 10,
  },
  {
    code: 'clean-sweep',
    name: 'Clean Sweep',
    description: 'Five days with two or more chores, every one sent in on time and approved.',
    category: 'Chores',
    icon: 'cleaning',
    measure: (s) => s.cleanSweeps,
    target: 5,
  },
  {
    code: 'team-player',
    name: 'Team Player',
    description: 'Help the family hit its weekly XP goal.',
    category: 'Team',
    icon: 'leaderboard',
    measure: (s) => s.teamGoalWeeks,
    target: 1,
  },
];
