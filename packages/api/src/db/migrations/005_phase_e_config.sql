-- Phase E: Tier 2 AI feature configuration columns
ALTER TABLE ai_config
  ADD COLUMN IF NOT EXISTS auto_tag BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS auto_triage BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS contradiction_detection BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS staleness_detection BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS thread_resolution_prompt BOOLEAN NOT NULL DEFAULT true;
