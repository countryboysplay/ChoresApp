-- Points, rewards, and cash-out.
--
-- The ledger is the single source of truth for points. There is no balance
-- column anywhere: spendable points are SUM(delta) and lifetime points are the
-- sum of the positive rows. A stored balance would eventually disagree with the
-- history behind it, and this is a household's money - a child noticing points
-- vanish with no line item is exactly the failure to design out.

-- Up Migration

CREATE TYPE ledger_reason AS ENUM (
  'chore_approved',
  'punctuality_bonus',
  'reward_redeemed',
  'reward_refunded',
  'cash_out',
  'achievement',
  'manual_adjustment'
);

CREATE TYPE redemption_status AS ENUM ('requested', 'approved', 'denied', 'fulfilled', 'cancelled');

CREATE TYPE cash_out_status AS ENUM ('requested', 'approved', 'denied', 'paid');

CREATE TABLE rewards (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name           text NOT NULL CHECK (length(btrim(name)) > 0),
  description    text NOT NULL DEFAULT '',
  cost_points    integer NOT NULL CHECK (cost_points > 0),
  category       text NOT NULL,
  icon           text NOT NULL,
  needs_approval boolean NOT NULL DEFAULT true,
  is_active      boolean NOT NULL DEFAULT true,
  -- Set when a reward is on cooldown, e.g. "resets Saturday".
  locked_until   date,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX rewards_active_idx ON rewards (category) WHERE is_active;

CREATE TABLE reward_redemptions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  reward_id    uuid NOT NULL REFERENCES rewards (id) ON DELETE RESTRICT,
  -- Snapshot. Repricing a reward must not change what a past redemption cost.
  cost_points  integer NOT NULL CHECK (cost_points > 0),
  status       redemption_status NOT NULL DEFAULT 'requested',
  requested_at timestamptz NOT NULL DEFAULT now(),
  decided_at   timestamptz,
  decided_by   uuid REFERENCES users (id) ON DELETE SET NULL,
  note         text,

  CONSTRAINT reward_redemptions_decided_has_time
    CHECK ((status IN ('requested')) = (decided_at IS NULL))
);

CREATE INDEX reward_redemptions_child_idx ON reward_redemptions (child_id, requested_at DESC);
CREATE INDEX reward_redemptions_pending_idx ON reward_redemptions (requested_at) WHERE status = 'requested';

-- Per-child flags on the reward catalog: hearted, and the one saving goal.
CREATE TABLE child_reward_preferences (
  child_id       uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  reward_id      uuid NOT NULL REFERENCES rewards (id) ON DELETE CASCADE,
  is_favorite    boolean NOT NULL DEFAULT false,
  is_primary_goal boolean NOT NULL DEFAULT false,
  PRIMARY KEY (child_id, reward_id)
);

-- A child saves toward one goal at a time; the home screen shows exactly one.
CREATE UNIQUE INDEX child_reward_preferences_one_goal
  ON child_reward_preferences (child_id) WHERE is_primary_goal;

CREATE TABLE cash_out_requests (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  points       integer NOT NULL CHECK (points > 0),
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  -- Monday of the household week this counts against, for the $40 weekly cap.
  week_start   date NOT NULL,
  status       cash_out_status NOT NULL DEFAULT 'requested',
  requested_at timestamptz NOT NULL DEFAULT now(),
  decided_at   timestamptz,
  decided_by   uuid REFERENCES users (id) ON DELETE SET NULL,
  note         text
);

CREATE INDEX cash_out_requests_week_idx ON cash_out_requests (child_id, week_start);
CREATE INDEX cash_out_requests_pending_idx ON cash_out_requests (requested_at) WHERE status = 'requested';

-- Append-only. Rows are never updated or deleted; a correction is another row.
CREATE TABLE points_ledger (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id             uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  delta                integer NOT NULL CHECK (delta <> 0),
  reason               ledger_reason NOT NULL,
  -- What the wallet shows on the row, e.g. "Kitchen Cleaning approved".
  label                text NOT NULL CHECK (length(btrim(label)) > 0),

  chore_instance_id    uuid REFERENCES chore_instances (id) ON DELETE SET NULL,
  reward_redemption_id uuid REFERENCES reward_redemptions (id) ON DELETE SET NULL,
  cash_out_id          uuid REFERENCES cash_out_requests (id) ON DELETE SET NULL,
  created_by           uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at           timestamptz NOT NULL DEFAULT now()
);

-- The wallet reads a child's history newest-first; balance sums the same index.
CREATE INDEX points_ledger_child_idx ON points_ledger (child_id, created_at DESC);

-- A chore can only ever pay out once. Without this, a double-tap on Approve
-- silently doubles a child's points and nothing downstream would notice.
CREATE UNIQUE INDEX points_ledger_one_award_per_chore
  ON points_ledger (chore_instance_id, reason)
  WHERE chore_instance_id IS NOT NULL;

CREATE TRIGGER rewards_set_updated_at
  BEFORE UPDATE ON rewards
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Down Migration

DROP TABLE points_ledger;
DROP TABLE cash_out_requests;
DROP TABLE child_reward_preferences;
DROP TABLE reward_redemptions;
DROP TABLE rewards;
DROP TYPE cash_out_status;
DROP TYPE redemption_status;
DROP TYPE ledger_reason;
