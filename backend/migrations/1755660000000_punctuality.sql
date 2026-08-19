-- Whether a submission beat the household's reminder time.
--
-- Decided when the child submits and frozen here, rather than worked out again
-- at approval. Two reasons. A parent may not review until the next morning, and
-- the answer must not depend on when they got round to it. And `reminder_time`
-- is a setting a parent can change - recomputing later would silently rewrite
-- whether chores already sent in were on time.

-- Up Migration

ALTER TABLE chore_instances
  ADD COLUMN submitted_punctual boolean;

COMMENT ON COLUMN chore_instances.submitted_punctual IS
  'True when submitted_at fell before household_settings.reminder_time on the chore day. Null until submitted.';

-- Down Migration

ALTER TABLE chore_instances
  DROP COLUMN submitted_punctual;
