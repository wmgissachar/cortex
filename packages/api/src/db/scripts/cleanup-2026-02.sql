-- ============================================================
-- BATCH DATA CLEANUP — February 2026 Post-Audit
-- ============================================================
-- WARNING: Review SELECT previews before running. Back up database first.

BEGIN;

-- 1. Resolve completed work threads
-- Criteria: open, has comments, no open tasks referencing it, not artifact discussion thread
UPDATE threads SET status = 'resolved'
WHERE status = 'open'
  AND comment_count > 0
  AND title NOT LIKE 'Discussion:%'
  AND id NOT IN (
    SELECT thread_id FROM tasks
    WHERE thread_id IS NOT NULL AND status IN ('open', 'in_progress')
  );

-- 2. Deprecate ATH-FREQ pre-audit decision artifact
-- The post-audit NO-GO decision supersedes the pre-audit assessment.
UPDATE artifacts SET status = 'deprecated'
WHERE type = 'decision'
  AND status = 'accepted'
  AND title ILIKE '%ATH-FREQ%'
  AND title NOT ILIKE '%NO-GO%'
  AND title NOT ILIKE '%Post-Audit%';

-- 3. Delete empty non-artifact threads (0 comments, no linked tasks/artifacts)
-- Preserves artifact discussion threads even if empty.
DELETE FROM threads
WHERE comment_count = 0
  AND status = 'open'
  AND title NOT LIKE 'Discussion:%'
  AND id NOT IN (SELECT thread_id FROM tasks WHERE thread_id IS NOT NULL)
  AND id NOT IN (SELECT thread_id FROM artifacts WHERE thread_id IS NOT NULL);

-- 4. Cancel stale open tasks (no updates in 2+ days)
UPDATE tasks SET status = 'cancelled', completed_at = NOW()
WHERE status = 'open'
  AND updated_at < NOW() - INTERVAL '2 days';

-- 5. Normalize tags: cold-start-embeddings → cold-start
UPDATE threads SET tags = array_replace(tags, 'cold-start-embeddings', 'cold-start')
WHERE 'cold-start-embeddings' = ANY(tags);
UPDATE comments SET tags = array_replace(tags, 'cold-start-embeddings', 'cold-start')
WHERE 'cold-start-embeddings' = ANY(tags);
UPDATE artifacts SET tags = array_replace(tags, 'cold-start-embeddings', 'cold-start')
WHERE 'cold-start-embeddings' = ANY(tags);
UPDATE tasks SET tags = array_replace(tags, 'cold-start-embeddings', 'cold-start')
WHERE 'cold-start-embeddings' = ANY(tags);

-- 6. Normalize tags: implementation-plan → implementation
UPDATE threads SET tags = array_replace(tags, 'implementation-plan', 'implementation')
WHERE 'implementation-plan' = ANY(tags);
UPDATE comments SET tags = array_replace(tags, 'implementation-plan', 'implementation')
WHERE 'implementation-plan' = ANY(tags);
UPDATE artifacts SET tags = array_replace(tags, 'implementation-plan', 'implementation')
WHERE 'implementation-plan' = ANY(tags);
UPDATE tasks SET tags = array_replace(tags, 'implementation-plan', 'implementation')
WHERE 'implementation-plan' = ANY(tags);

-- 7. Deduplicate tag arrays
UPDATE threads SET tags = (SELECT ARRAY(SELECT DISTINCT unnest(tags) ORDER BY 1))
WHERE array_length(tags, 1) > 0;
UPDATE comments SET tags = (SELECT ARRAY(SELECT DISTINCT unnest(tags) ORDER BY 1))
WHERE array_length(tags, 1) > 0;
UPDATE artifacts SET tags = (SELECT ARRAY(SELECT DISTINCT unnest(tags) ORDER BY 1))
WHERE array_length(tags, 1) > 0;
UPDATE tasks SET tags = (SELECT ARRAY(SELECT DISTINCT unnest(tags) ORDER BY 1))
WHERE array_length(tags, 1) > 0;

COMMIT;
