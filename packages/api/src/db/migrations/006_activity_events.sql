-- Migration 006: Activity event tracking
-- Targeted behavioral event tracking for evaluating Cortex against success criteria.
-- 16 event types covering human engagement, agent tool usage, and system events.

CREATE TABLE IF NOT EXISTS activity_events (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id),
    principal_id UUID REFERENCES principals(id),
    source       VARCHAR(16) NOT NULL,   -- 'human', 'agent', 'system'
    event_type   VARCHAR(64) NOT NULL,
    payload      JSONB NOT NULL DEFAULT '{}',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Query pattern: all events of type X in time range (summary by event type)
CREATE INDEX idx_activity_events_type_created
    ON activity_events (event_type, created_at DESC);

-- Query pattern: all events for workspace in time range (daily engagement)
CREATE INDEX idx_activity_events_workspace_created
    ON activity_events (workspace_id, created_at DESC);

-- Query pattern: human vs agent breakdown
CREATE INDEX idx_activity_events_source_created
    ON activity_events (source, created_at DESC);
