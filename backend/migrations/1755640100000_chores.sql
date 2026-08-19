-- Chores, split into definition and instance.
--
-- A definition is the reusable template a parent edits. An instance is one
-- chore, for one child, on one household day. They are separate tables because
-- editing "Kitchen Cleaning" next month must not rewrite what a child actually
-- did last week. For the same reason instance subtasks snapshot their title and
-- instruction rather than joining back to the template at read time.

-- Up Migration

CREATE TYPE chore_kind AS ENUM ('core', 'bonus');

CREATE TYPE chore_status AS ENUM (
  'not_started',
  'in_progress',
  'submitted',
  'approved',
  'rejected',
  'missed',
  'excused',
  'carried_over'
);

CREATE TYPE chore_recurrence AS ENUM ('daily', 'weekly');

CREATE TABLE chore_definitions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL CHECK (length(btrim(name)) > 0),
  icon        text NOT NULL,
  kind        chore_kind NOT NULL,
  points      integer NOT NULL CHECK (points > 0),
  category    text,
  instructions text,
  is_active   boolean NOT NULL DEFAULT true,
  created_by  uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX chore_definitions_kind_idx ON chore_definitions (kind) WHERE is_active;

CREATE TABLE chore_subtask_templates (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chore_definition_id  uuid NOT NULL REFERENCES chore_definitions (id) ON DELETE CASCADE,
  position             integer NOT NULL CHECK (position >= 0),
  title                text NOT NULL CHECK (length(btrim(title)) > 0),
  instruction          text,
  UNIQUE (chore_definition_id, position) DEFERRABLE INITIALLY IMMEDIATE
);

-- Which child owes which core chore, and how often.
CREATE TABLE chore_schedules (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chore_definition_id  uuid NOT NULL REFERENCES chore_definitions (id) ON DELETE CASCADE,
  assigned_to          uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  recurrence           chore_recurrence NOT NULL,
  -- ISO weekday numbers, 1 = Monday .. 7 = Sunday. Only read when weekly.
  days_of_week         smallint[] NOT NULL DEFAULT '{}',
  starts_on            date NOT NULL,
  ends_on              date,
  is_active            boolean NOT NULL DEFAULT true,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),

  -- cardinality(), not array_length(). array_length('{}', 1) is NULL rather than
  -- 0, so `NULL > 0` makes the whole OR null, and a CHECK only rejects on FALSE
  -- - the constraint would have silently permitted exactly what it forbids.
  CONSTRAINT chore_schedules_weekly_needs_days
    CHECK (recurrence <> 'weekly' OR cardinality(days_of_week) > 0),
  CONSTRAINT chore_schedules_days_in_range
    CHECK (days_of_week <@ ARRAY[1,2,3,4,5,6,7]::smallint[]),
  CONSTRAINT chore_schedules_ends_after_starts
    CHECK (ends_on IS NULL OR ends_on >= starts_on)
);

CREATE INDEX chore_schedules_active_idx ON chore_schedules (assigned_to) WHERE is_active;

CREATE TABLE chore_instances (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chore_definition_id  uuid NOT NULL REFERENCES chore_definitions (id) ON DELETE RESTRICT,
  -- Null for a bonus chore nobody has claimed yet.
  assigned_to          uuid REFERENCES users (id) ON DELETE CASCADE,
  -- The household chore day, computed in America/Chicago by the application.
  chore_date           date NOT NULL,
  status               chore_status NOT NULL DEFAULT 'not_started',

  -- Snapshot: the definition's points can change later, this is what was earned.
  points_value         integer NOT NULL CHECK (points_value > 0),
  points_awarded       integer CHECK (points_awarded IS NULL OR points_awarded >= 0),

  claimed_at           timestamptz,
  expires_at           timestamptz,
  started_at           timestamptz,
  submitted_at         timestamptz,
  reviewed_at          timestamptz,
  reviewed_by          uuid REFERENCES users (id) ON DELETE SET NULL,
  rejection_note       text,
  carried_over_from    uuid REFERENCES chore_instances (id) ON DELETE SET NULL,

  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),

  -- A rejection has to say why; that note is the whole point of the fix-it flow.
  CONSTRAINT chore_instances_rejection_has_note
    CHECK (status <> 'rejected' OR length(btrim(coalesce(rejection_note, ''))) > 0),
  -- Points are only ever recorded on an approved chore.
  CONSTRAINT chore_instances_award_only_when_approved
    CHECK (points_awarded IS NULL OR status = 'approved')
);

-- One core chore per child per day. Bonus chores are excluded: several can
-- exist on the same day, and an unclaimed one has no assignee to key on.
CREATE UNIQUE INDEX chore_instances_one_core_per_child_per_day
  ON chore_instances (chore_definition_id, assigned_to, chore_date)
  WHERE assigned_to IS NOT NULL;

-- The child's day view and the parent's approval queue are the hot reads.
CREATE INDEX chore_instances_child_day_idx ON chore_instances (assigned_to, chore_date);
CREATE INDEX chore_instances_status_idx ON chore_instances (status, submitted_at);

CREATE TABLE chore_instance_subtasks (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chore_instance_id  uuid NOT NULL REFERENCES chore_instances (id) ON DELETE CASCADE,
  -- Kept for provenance only. Null if the template was deleted since.
  template_id        uuid REFERENCES chore_subtask_templates (id) ON DELETE SET NULL,
  position           integer NOT NULL CHECK (position >= 0),
  -- Snapshotted, not joined. Editing the template must not rewrite history.
  title              text NOT NULL CHECK (length(btrim(title)) > 0),
  instruction        text,
  done               boolean NOT NULL DEFAULT false,
  done_at            timestamptz,

  UNIQUE (chore_instance_id, position),
  CONSTRAINT chore_instance_subtasks_done_has_time
    CHECK (done = (done_at IS NOT NULL))
);

CREATE TABLE chore_photos (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chore_instance_id   uuid NOT NULL REFERENCES chore_instances (id) ON DELETE CASCADE,
  uploaded_by         uuid REFERENCES users (id) ON DELETE SET NULL,
  -- Relative to PHOTO_STORAGE_DIR. The bytes never live in Postgres.
  file_path           text NOT NULL UNIQUE,
  byte_size           integer CHECK (byte_size IS NULL OR byte_size > 0),
  width               integer,
  height              integer,
  sha256              text,
  -- The approval queue refuses "Approve all" until every photo has been opened,
  -- so which parent looked at what, and when, has to be recorded.
  first_viewed_at     timestamptz,
  first_viewed_by     uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX chore_photos_instance_idx ON chore_photos (chore_instance_id);

CREATE TRIGGER chore_definitions_set_updated_at
  BEFORE UPDATE ON chore_definitions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER chore_schedules_set_updated_at
  BEFORE UPDATE ON chore_schedules
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER chore_instances_set_updated_at
  BEFORE UPDATE ON chore_instances
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Down Migration

DROP TABLE chore_photos;
DROP TABLE chore_instance_subtasks;
DROP TABLE chore_instances;
DROP TABLE chore_schedules;
DROP TABLE chore_subtask_templates;
DROP TABLE chore_definitions;
DROP TYPE chore_recurrence;
DROP TYPE chore_status;
DROP TYPE chore_kind;
