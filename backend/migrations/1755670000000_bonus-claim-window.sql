-- How long a bonus chore stays claimable, stored rather than inferred.
--
-- When a claim lapses the chore goes back on the board with a fresh window of
-- the same length. Working that length out from (expires_at - created_at) looked
-- tempting and is wrong twice over: it is destroyed the moment expires_at is
-- rewritten, and after one release created_at no longer marks the start of the
-- window, so each subsequent release would hand out a longer one than the last.

-- Up Migration

ALTER TABLE chore_instances
  ADD COLUMN claim_window_minutes integer
    CHECK (claim_window_minutes IS NULL OR claim_window_minutes > 0);

COMMENT ON COLUMN chore_instances.claim_window_minutes IS
  'Bonus chores only. Minutes a claim lasts before the chore returns to the board. Null means no deadline.';

-- Down Migration

ALTER TABLE chore_instances
  DROP COLUMN claim_window_minutes;
