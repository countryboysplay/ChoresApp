-- Sessions and PIN lockout.
--
-- A session token is opaque and random; only its SHA-256 lands here. Someone
-- reading a database backup therefore cannot log in as a child, which matters
-- because the backups (Stage 15) live on the same laptop as the database.
--
-- Lockout state sits on `users` rather than being counted from a log table so
-- the check is one indexed read on the row already being fetched to verify the
-- PIN. Rate limiting by IP would be close to useless here: the whole household
-- shares one address.

-- Up Migration

ALTER TABLE users
  ADD COLUMN failed_pin_attempts integer NOT NULL DEFAULT 0
    CHECK (failed_pin_attempts >= 0),
  ADD COLUMN pin_locked_until    timestamptz,
  ADD COLUMN pin_set_at          timestamptz,
  ADD COLUMN last_login_at       timestamptz;

CREATE TABLE sessions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,

  -- SHA-256 of the token, hex. The token itself exists only in the cookie.
  token_hash    text NOT NULL UNIQUE,

  -- Free text the parent can recognise on the sessions screen, e.g.
  -- "Child 1 iPhone". Derived from the user agent at login.
  device_label  text,
  user_agent    text,
  ip_address    inet,

  created_at    timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL,
  -- Set when the session is ended deliberately, by logout or by a parent
  -- revoking a device. Kept rather than deleted so "signed out on 12 Aug" is
  -- still answerable.
  revoked_at    timestamptz,
  revoked_by    uuid REFERENCES users (id) ON DELETE SET NULL,

  CONSTRAINT sessions_expires_after_created CHECK (expires_at > created_at)
);

-- Every authenticated request looks a session up by token hash.
CREATE INDEX sessions_user_idx ON sessions (user_id, last_seen_at DESC);
-- Sweeping expired rows, and listing a user's live devices.
CREATE INDEX sessions_live_idx ON sessions (expires_at) WHERE revoked_at IS NULL;

-- Down Migration

DROP TABLE sessions;

ALTER TABLE users
  DROP COLUMN last_login_at,
  DROP COLUMN pin_set_at,
  DROP COLUMN pin_locked_until,
  DROP COLUMN failed_pin_attempts;
