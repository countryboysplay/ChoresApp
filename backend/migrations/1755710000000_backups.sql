-- What was backed up, when, and whether it worked.
--
-- The filesystem could answer most of this by itself, but not the question that
-- matters most: did the last attempt fail. A folder that is not there looks
-- exactly like a backup that was never scheduled, and "no backup last night"
-- has to be something the System status screen can say out loud rather than
-- something a parent infers from an absence.
--
-- `chore_date` is the household day a backup covers rather than a timestamp,
-- because the nightly run is a reconciliation like everything else here: it
-- asks whether today already has one, not whether a timer fired. A restart at
-- 4am after a 3am run was missed still produces the night's backup, and a
-- second restart does not produce a second copy.

-- Up Migration

CREATE TYPE backup_status AS ENUM ('running', 'ok', 'failed');
CREATE TYPE backup_kind AS ENUM ('scheduled', 'manual');

CREATE TABLE backups (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status       backup_status NOT NULL DEFAULT 'running',
  kind         backup_kind NOT NULL,

  -- The household day this backup covers. Nightly runs are one per day.
  chore_date   date NOT NULL,

  started_at   timestamptz NOT NULL DEFAULT now(),
  finished_at  timestamptz,

  -- Absolute path to the backup folder, as it was written.
  directory    text NOT NULL,
  bytes        bigint CHECK (bytes IS NULL OR bytes >= 0),
  photo_count  integer CHECK (photo_count IS NULL OR photo_count >= 0),

  -- The copy on the removable drive. Null when the drive was not plugged in,
  -- which is not a failure - it is the ordinary case, and the screen says so.
  mirrored_at  timestamptz,
  mirror_path  text,

  -- Client-safe text. Whatever went wrong, in a sentence a parent can act on.
  error        text,

  CONSTRAINT backups_finished_after_started
    CHECK (finished_at IS NULL OR finished_at >= started_at)
);

-- Only one scheduled backup per household day. A manual one can be taken at any
-- time, as often as somebody likes - that is what the button is for - so the
-- index deliberately covers scheduled runs only.
CREATE UNIQUE INDEX backups_one_scheduled_per_day
  ON backups (chore_date) WHERE kind = 'scheduled';

-- "When did this last work" and the retention sweep both read this way.
CREATE INDEX backups_recent_idx ON backups (started_at DESC);

-- Down Migration

DROP TABLE backups;
DROP TYPE backup_kind;
DROP TYPE backup_status;
