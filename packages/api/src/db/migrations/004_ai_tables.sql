-- Migration 004: AI agent layer tables
-- Creates ai_jobs (job tracking), ai_usage (token/cost tracking), ai_config (per-workspace config)

-- AI job tracking
CREATE TABLE IF NOT EXISTS ai_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id),
    persona VARCHAR(64) NOT NULL,
    feature VARCHAR(64) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'queued',
    input JSONB NOT NULL,
    output JSONB,
    error TEXT,
    depth SMALLINT NOT NULL DEFAULT 0,
    tokens_used INTEGER,
    cost_usd NUMERIC(10, 6),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ai_jobs_workspace_created ON ai_jobs(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_jobs_status ON ai_jobs(status);
CREATE INDEX IF NOT EXISTS idx_ai_jobs_persona_created ON ai_jobs(persona, created_at DESC);

-- Token usage tracking (one row per LLM call)
CREATE TABLE IF NOT EXISTS ai_usage (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id),
    job_id UUID REFERENCES ai_jobs(id),
    persona VARCHAR(64) NOT NULL,
    model VARCHAR(128) NOT NULL,
    input_tokens INTEGER NOT NULL,
    output_tokens INTEGER NOT NULL,
    cost_usd NUMERIC(10, 6) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_workspace_month ON ai_usage(workspace_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ai_usage_persona_day ON ai_usage(persona, created_at);

-- AI configuration per workspace
CREATE TABLE IF NOT EXISTS ai_config (
    workspace_id UUID PRIMARY KEY REFERENCES workspaces(id),
    enabled BOOLEAN NOT NULL DEFAULT true,
    monthly_budget_usd NUMERIC(10, 2) NOT NULL DEFAULT 50.00,
    daily_digest_time TIME DEFAULT '07:00',
    auto_summarize BOOLEAN NOT NULL DEFAULT true,
    auto_review BOOLEAN NOT NULL DEFAULT true,
    auto_link BOOLEAN NOT NULL DEFAULT true,
    config JSONB DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER ai_config_updated_at
    BEFORE UPDATE ON ai_config
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Seed default config for existing workspaces
INSERT INTO ai_config (workspace_id)
SELECT id FROM workspaces
ON CONFLICT (workspace_id) DO NOTHING;
