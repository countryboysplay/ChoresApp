-- What a notification is about, so one can be sent exactly once.
--
-- The reminder sweep runs on a timer but is written as a reconciliation: it asks
-- "is this chore unfinished, is it past the reminder time, and has nobody been
-- told yet", which gives the same answer however many times it runs. The unique
-- index below is what makes the last part cheap and race-proof, so two ticks
-- overlapping cannot produce two identical nudges.

-- Up Migration

ALTER TABLE notifications
  ADD COLUMN kind text NOT NULL DEFAULT 'general',
  ADD COLUMN chore_instance_id uuid REFERENCES chore_instances (id) ON DELETE CASCADE,
  ADD COLUMN reward_redemption_id uuid REFERENCES reward_redemptions (id) ON DELETE CASCADE;

COMMENT ON COLUMN notifications.kind IS
  'chore_reminder, chore_escalation, chore_approved, chore_rejected, reward_decided, bonus_posted, general';

-- One notification per person, per thing, per kind. A second attempt is a no-op
-- rather than a duplicate in somebody's inbox.
CREATE UNIQUE INDEX notifications_once_per_chore
  ON notifications (user_id, chore_instance_id, kind)
  WHERE chore_instance_id IS NOT NULL;

CREATE UNIQUE INDEX notifications_once_per_redemption
  ON notifications (user_id, reward_redemption_id, kind)
  WHERE reward_redemption_id IS NOT NULL;

-- Down Migration

DROP INDEX notifications_once_per_redemption;
DROP INDEX notifications_once_per_chore;

ALTER TABLE notifications
  DROP COLUMN reward_redemption_id,
  DROP COLUMN chore_instance_id,
  DROP COLUMN kind;
