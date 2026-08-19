-- Push subscriptions, and the record of what has already been pushed.
--
-- A subscription belongs to a browser, not to a person: the endpoint is minted
-- by the phone's push service and is the same string whoever is signed in. That
-- is why `endpoint` is the unique key and `user_id` is just a column. A shared
-- tablet where one child signs out and another signs in must move the
-- subscription across rather than keeping two, or the first child's reminders
-- would keep arriving on a phone they no longer hold.
--
-- `session_id` ties it to the sign-in that created it, so signing out or having
-- a device revoked takes the subscription with it. Nothing here is recoverable
-- or worth keeping after that point - the browser mints a fresh endpoint next
-- time - so this is the one place a row is deleted rather than marked.

-- Up Migration

CREATE TABLE push_subscriptions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  -- Null once the originating session is gone but the browser is still
  -- subscribed; the cleanup deletes those rows, so it is only null in flight.
  session_id   uuid REFERENCES sessions (id) ON DELETE SET NULL,

  -- The push service URL. Long, opaque, and unique to one browser install.
  endpoint     text NOT NULL UNIQUE CHECK (length(btrim(endpoint)) > 0),
  -- The browser's public key and auth secret, both base64url. These encrypt the
  -- payload; without them the server can only send an empty ping.
  p256dh       text NOT NULL,
  auth         text NOT NULL,

  device_label text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_sent_at timestamptz
);

CREATE INDEX push_subscriptions_user_idx ON push_subscriptions (user_id);
CREATE INDEX push_subscriptions_session_idx ON push_subscriptions (session_id)
  WHERE session_id IS NOT NULL;

-- When a notification was pushed to a phone, or null if it never was. Set even
-- when nothing was sent - no subscriptions, push not configured, or the kind is
-- not one that buzzes - because the column answers "has the sender finished
-- with this row", not "did a phone ring".
ALTER TABLE notifications ADD COLUMN pushed_at timestamptz;

-- The drain reads exactly this: unpushed, unread, recent. Kept partial so the
-- index stays roughly the size of the queue rather than the size of the inbox.
CREATE INDEX notifications_push_queue_idx
  ON notifications (created_at) WHERE pushed_at IS NULL;

-- Down Migration

DROP INDEX notifications_push_queue_idx;
ALTER TABLE notifications DROP COLUMN pushed_at;
DROP TABLE push_subscriptions;
