-- 008: Topic lifecycle states (exploring → converging → concluded)
DO $$ BEGIN
  CREATE TYPE topic_lifecycle_state AS ENUM ('exploring', 'converging', 'concluded');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE topics
  ADD COLUMN IF NOT EXISTS lifecycle_state topic_lifecycle_state NOT NULL DEFAULT 'exploring';
