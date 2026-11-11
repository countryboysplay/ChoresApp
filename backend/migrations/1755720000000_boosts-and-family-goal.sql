-- XP boosts and the weekly family goal.
--
-- A boost doubles a chore's XP (level progress) and never its coins. It does so
-- without writing a single points row: `xp_ledger` below derives the extra XP
-- from the award rows approval already wrote, so the spendable balance - which
-- every wallet, reward and cash-out query sums straight off points_ledger - is
-- untouched by construction rather than by every query remembering a filter.

-- Up Migration

CREATE TABLE boosts (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id          uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  -- The streak run that earned it: its first day and which multiple of 7 it
  -- reached. The unique key is what makes a milestone pay out once per run.
  streak_start      date NOT NULL,
  milestone         integer NOT NULL CHECK (milestone > 0 AND milestone % 7 = 0),
  earned_at         timestamptz NOT NULL DEFAULT now(),
  -- The chore it is armed on. Null while it is waiting to be used.
  chore_instance_id uuid REFERENCES chore_instances (id) ON DELETE SET NULL,
  armed_at          timestamptz,
  UNIQUE (child_id, streak_start, milestone)
);

-- Two boosts on one chore would be 3x, which is not a thing.
CREATE UNIQUE INDEX boosts_one_per_chore ON boosts (chore_instance_id)
  WHERE chore_instance_id IS NOT NULL;

-- Every XP a child has earned: each positive points row, plus a second copy of
-- the positive rows of any chore a boost was armed on. Lifetime XP, levels, the
-- leaderboard and the family goal read this; balance never does.
CREATE VIEW xp_ledger AS
  SELECT p.child_id, p.delta AS xp, p.created_at, p.chore_instance_id, false AS boosted
    FROM points_ledger p
   WHERE p.delta > 0
     -- Coins handed back (a denied reward or cash-out) were never earned XP.
     AND p.reason NOT IN ('reward_refunded', 'cash_out')
  UNION ALL
  SELECT p.child_id, p.delta AS xp, p.created_at, p.chore_instance_id, true AS boosted
    FROM boosts b
    JOIN points_ledger p ON p.chore_instance_id = b.chore_instance_id AND p.child_id = b.child_id
   WHERE p.delta > 0;

ALTER TABLE household_settings
  ADD COLUMN weekly_xp_goal integer CHECK (weekly_xp_goal IS NULL OR weekly_xp_goal > 0),
  ADD COLUMN weekly_goal_reward text CHECK (weekly_goal_reward IS NULL OR length(weekly_goal_reward) <= 60);

-- Down Migration

ALTER TABLE household_settings
  DROP COLUMN weekly_goal_reward,
  DROP COLUMN weekly_xp_goal;
DROP VIEW xp_ledger;
DROP TABLE boosts;
