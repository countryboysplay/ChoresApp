-- Achievements and the notification inbox.
--
-- Achievements are a catalog plus per-child progress rather than a boolean on
-- the child row, so adding a badge later is an INSERT and not a migration.
-- `code` is the stable identifier the application logic keys on; `name` is only
-- ever shown to a person and can be reworded freely.

-- Up Migration

CREATE TYPE notification_tone AS ENUM ('done', 'waiting', 'late', 'info');

CREATE TABLE achievements (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code        text NOT NULL UNIQUE CHECK (length(btrim(code)) > 0),
  name        text NOT NULL,
  description text NOT NULL DEFAULT '',
  category    text NOT NULL,
  icon        text NOT NULL,
  -- Null for a one-shot badge; set when the badge has a "3 of 5" meter.
  target      integer CHECK (target IS NULL OR target > 0),
  is_active   boolean NOT NULL DEFAULT true,
  sort_order  integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE child_achievements (
  child_id       uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  achievement_id uuid NOT NULL REFERENCES achievements (id) ON DELETE CASCADE,
  progress       integer NOT NULL DEFAULT 0 CHECK (progress >= 0),
  earned_at      timestamptz,
  PRIMARY KEY (child_id, achievement_id)
);

CREATE INDEX child_achievements_earned_idx
  ON child_achievements (child_id, earned_at DESC) WHERE earned_at IS NOT NULL;

CREATE TABLE notifications (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  title      text NOT NULL CHECK (length(btrim(title)) > 0),
  body       text NOT NULL DEFAULT '',
  tone       notification_tone NOT NULL DEFAULT 'info',
  -- Hash-router path, e.g. "#/child/chore/<id>". Push deep links must be built
  -- in hash form because the frontend uses HashRouter on GitHub Pages.
  deep_link  text,
  read_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- The bell badge counts unread for one user; that is the only hot query here.
CREATE INDEX notifications_unread_idx
  ON notifications (user_id, created_at DESC) WHERE read_at IS NULL;
CREATE INDEX notifications_user_idx ON notifications (user_id, created_at DESC);

-- Down Migration

DROP TABLE notifications;
DROP TABLE child_achievements;
DROP TABLE achievements;
DROP TYPE notification_tone;
