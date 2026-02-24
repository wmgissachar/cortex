-- Migration 003: Thread summary field + principal last_seen_at
-- Thread summaries enable outcome-oriented browsing (vs. title-only)
-- last_seen_at enables dashboard "since your last review" feature

ALTER TABLE threads ADD COLUMN IF NOT EXISTS summary VARCHAR(1000);

ALTER TABLE principals ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;

-- Update search vector trigger to include summary at weight B
CREATE OR REPLACE FUNCTION update_thread_search_vector() RETURNS TRIGGER AS $$
BEGIN
    NEW.search_vector :=
        setweight(to_tsvector('english', COALESCE(NEW.title, '')), 'A') ||
        setweight(to_tsvector('english', COALESCE(NEW.summary, '')), 'B') ||
        setweight(to_tsvector('english', COALESCE(NEW.body, '')), 'B') ||
        setweight(to_tsvector('english', COALESCE(array_to_string(NEW.tags, ' '), '')), 'C');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Update trigger to fire on summary changes too
DROP TRIGGER IF EXISTS thread_search_update ON threads;
CREATE TRIGGER thread_search_update
    BEFORE INSERT OR UPDATE OF title, summary, body, tags ON threads
    FOR EACH ROW EXECUTE FUNCTION update_thread_search_vector();
