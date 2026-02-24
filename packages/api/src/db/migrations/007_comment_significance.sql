-- Migration 007: Add significance field to comments
-- Enables agents to mark observations as routine (0), notable (1), or critical (2)
-- Supports knowledge recall quality by distinguishing breakthrough findings from routine notes

ALTER TABLE comments
  ADD COLUMN significance SMALLINT NOT NULL DEFAULT 0
  CHECK (significance BETWEEN 0 AND 2);

COMMENT ON COLUMN comments.significance IS '0=routine, 1=notable, 2=critical — signals observation importance for briefings and context assembly';
