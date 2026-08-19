-- Household identity and the single settings row.
--
-- Timestamps are timestamptz and always stored in UTC. Anything that is a
-- *household day* rather than an instant is a plain `date` computed in
-- America/Chicago by the application, per the Intl decision in DECISIONS.md.
-- Postgres is never asked to do timezone arithmetic, so a server-side timezone
-- change cannot silently move a chore day.

-- Up Migration

CREATE TYPE user_role AS ENUM ('parent', 'child');

CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role          user_role NOT NULL,
  display_name  text NOT NULL CHECK (length(btrim(display_name)) > 0),
  -- Null until the parent sets one. Never store the PIN itself.
  pin_hash      text,
  -- Child avatar, matching AvatarConfig in the frontend. Null for parents.
  avatar        jsonb,
  is_active     boolean NOT NULL DEFAULT true,
  sort_order    integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Profile select and the leaderboard both list children in a stable order.
CREATE INDEX users_role_active_idx ON users (role, sort_order) WHERE is_active;

-- One row, enforced by the primary key. Simpler to query than a key/value table
-- and it lets each setting keep a real type and its own CHECK.
CREATE TABLE household_settings (
  id                        boolean PRIMARY KEY DEFAULT true CHECK (id),

  core_point_value          integer NOT NULL DEFAULT 10 CHECK (core_point_value > 0),
  punctuality_bonus_points  integer NOT NULL DEFAULT 2  CHECK (punctuality_bonus_points >= 0),

  -- Deliberately NULL. The specification forbids inventing either value, and
  -- the wallet renders its "cash-out is turned off" state until an owner sets
  -- them in Settings. Do not add a default here.
  points_per_dollar         numeric(10, 2) CHECK (points_per_dollar IS NULL OR points_per_dollar > 0),
  minimum_cash_out_points   integer        CHECK (minimum_cash_out_points IS NULL OR minimum_cash_out_points >= 0),

  -- Fixed by the specification at $40/week. Cents, never floating point.
  weekly_cash_out_cap_cents integer NOT NULL DEFAULT 4000 CHECK (weekly_cash_out_cap_cents > 0),

  reminder_time             time NOT NULL DEFAULT '20:45',
  escalation_time           time NOT NULL DEFAULT '23:00',
  timezone                  text NOT NULL DEFAULT 'America/Chicago',

  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

-- The application always reads settings; it must never find zero rows.
INSERT INTO household_settings (id) VALUES (true);

-- Keeps updated_at honest without every query having to remember it.
CREATE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_set_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER household_settings_set_updated_at
  BEFORE UPDATE ON household_settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Down Migration

DROP TRIGGER household_settings_set_updated_at ON household_settings;
DROP TRIGGER users_set_updated_at ON users;
DROP FUNCTION set_updated_at();
DROP TABLE household_settings;
DROP TABLE users;
DROP TYPE user_role;
