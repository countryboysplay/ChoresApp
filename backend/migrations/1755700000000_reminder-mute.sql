-- Whether a parent has silenced a child's phone reminders.
--
-- The child app has no off switch. Browsers will not allow one to be taken away
-- entirely - notification permission belongs to the person holding the device,
-- and Chrome's own settings can always revoke it - so the app does the only two
-- things it can: it never offers a way out of its own, and it reports the state
-- to a parent when a child has found the browser's. This column is the parent's
-- side of that: the one deliberate off switch in the system, on the one screen a
-- child cannot reach.
--
-- It lives on `users` rather than in its own table because it is a single fact
-- about a person that the drain has to check on every send, and the user row is
-- already being read.

-- Up Migration

ALTER TABLE users
  ADD COLUMN reminders_muted boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN users.reminders_muted IS
  'Parent has silenced phone reminders for this child. The inbox still fills.';

-- Down Migration

ALTER TABLE users DROP COLUMN reminders_muted;
