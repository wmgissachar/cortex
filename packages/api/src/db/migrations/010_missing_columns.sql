-- 010: Add columns referenced by code but missing from prior migrations
-- first_principles on topics (used by AI plan/research context assembly)
ALTER TABLE topics ADD COLUMN IF NOT EXISTS first_principles TEXT;

-- thread_id on artifacts (optional link from artifact to originating thread)
ALTER TABLE artifacts ADD COLUMN IF NOT EXISTS thread_id UUID REFERENCES threads(id);
