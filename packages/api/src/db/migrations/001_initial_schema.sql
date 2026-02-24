-- Cortex Initial Schema Migration
-- Version: 001
-- Description: Creates all tables, enums, indexes, and triggers for Cortex v1

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Enums
CREATE TYPE principal_kind AS ENUM ('human', 'agent', 'system');
CREATE TYPE thread_type AS ENUM ('question', 'discussion', 'decision', 'incident');
CREATE TYPE thread_status AS ENUM ('open', 'resolved', 'archived');
CREATE TYPE comment_type AS ENUM ('reply', 'observation', 'decision', 'test_result');
CREATE TYPE artifact_type AS ENUM ('decision', 'procedure', 'document', 'glossary');
CREATE TYPE artifact_status AS ENUM ('draft', 'proposed', 'accepted', 'deprecated');
CREATE TYPE task_status AS ENUM ('open', 'in_progress', 'done', 'cancelled');
CREATE TYPE task_priority AS ENUM ('low', 'medium', 'high');

-- Tables
CREATE TABLE workspaces (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE principals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id),
    kind principal_kind NOT NULL,
    handle VARCHAR(64) NOT NULL,
    display_name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    password_hash VARCHAR(255),
    trust_tier SMALLINT NOT NULL DEFAULT 1 CHECK (trust_tier >= 0 AND trust_tier <= 2),
    api_key_hash VARCHAR(255),
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_active_at TIMESTAMPTZ,
    UNIQUE (workspace_id, handle),
    UNIQUE (workspace_id, email)
);

CREATE TABLE refresh_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    principal_id UUID NOT NULL REFERENCES principals(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked_at TIMESTAMPTZ
);

CREATE TABLE topics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id),
    handle VARCHAR(64) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    icon VARCHAR(64),
    thread_count INTEGER NOT NULL DEFAULT 0,
    artifact_count INTEGER NOT NULL DEFAULT 0,
    archived_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID NOT NULL REFERENCES principals(id),
    UNIQUE (workspace_id, handle)
);

CREATE TABLE threads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id),
    topic_id UUID NOT NULL REFERENCES topics(id),
    title VARCHAR(500) NOT NULL,
    type thread_type NOT NULL DEFAULT 'discussion',
    status thread_status NOT NULL DEFAULT 'open',
    body TEXT,
    tags TEXT[] DEFAULT '{}',
    comment_count INTEGER NOT NULL DEFAULT 0,
    pinned BOOLEAN NOT NULL DEFAULT FALSE,
    search_vector TSVECTOR,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID NOT NULL REFERENCES principals(id),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE comments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    thread_id UUID NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
    parent_id UUID REFERENCES comments(id),
    type comment_type NOT NULL DEFAULT 'reply',
    body TEXT NOT NULL,
    tags TEXT[] DEFAULT '{}',
    attachments JSONB DEFAULT '[]',
    depth SMALLINT NOT NULL DEFAULT 0 CHECK (depth <= 5),
    search_vector TSVECTOR,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID NOT NULL REFERENCES principals(id),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    edited BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE artifacts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id),
    topic_id UUID NOT NULL REFERENCES topics(id),
    title VARCHAR(500) NOT NULL,
    type artifact_type NOT NULL,
    status artifact_status NOT NULL DEFAULT 'draft',
    body TEXT NOT NULL,
    summary VARCHAR(1000),
    tags TEXT[] DEFAULT '{}',
    "references" JSONB DEFAULT '[]',
    version INTEGER NOT NULL DEFAULT 1,
    search_vector TSVECTOR,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID NOT NULL REFERENCES principals(id),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    accepted_at TIMESTAMPTZ,
    accepted_by UUID REFERENCES principals(id)
);

CREATE TABLE tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id),
    topic_id UUID REFERENCES topics(id),
    thread_id UUID REFERENCES threads(id),
    title VARCHAR(500) NOT NULL,
    body TEXT,
    status task_status NOT NULL DEFAULT 'open',
    priority task_priority NOT NULL DEFAULT 'medium',
    assignee_id UUID REFERENCES principals(id),
    due_date DATE,
    tags TEXT[] DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID NOT NULL REFERENCES principals(id),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id),
    principal_id UUID NOT NULL REFERENCES principals(id),
    action VARCHAR(64) NOT NULL,
    entity_type VARCHAR(64) NOT NULL,
    entity_id UUID NOT NULL,
    changes JSONB,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_principals_workspace ON principals(workspace_id);
CREATE INDEX idx_principals_handle ON principals(workspace_id, handle);
CREATE INDEX idx_principals_email ON principals(workspace_id, email) WHERE email IS NOT NULL;
CREATE INDEX idx_refresh_tokens_principal ON refresh_tokens(principal_id);
CREATE INDEX idx_refresh_tokens_expires ON refresh_tokens(expires_at) WHERE revoked_at IS NULL;
CREATE INDEX idx_topics_workspace ON topics(workspace_id);
CREATE INDEX idx_threads_topic ON threads(topic_id);
CREATE INDEX idx_threads_workspace ON threads(workspace_id);
CREATE INDEX idx_threads_created ON threads(created_at DESC);
CREATE INDEX idx_threads_search ON threads USING GIN(search_vector);
CREATE INDEX idx_comments_thread ON comments(thread_id);
CREATE INDEX idx_comments_created ON comments(created_at DESC);
CREATE INDEX idx_comments_search ON comments USING GIN(search_vector);
CREATE INDEX idx_artifacts_topic ON artifacts(topic_id);
CREATE INDEX idx_artifacts_workspace ON artifacts(workspace_id);
CREATE INDEX idx_artifacts_status ON artifacts(status);
CREATE INDEX idx_artifacts_search ON artifacts USING GIN(search_vector);
CREATE INDEX idx_tasks_workspace ON tasks(workspace_id);
CREATE INDEX idx_tasks_assignee ON tasks(assignee_id) WHERE assignee_id IS NOT NULL;
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_logs_created ON audit_logs(created_at DESC);

-- Triggers for search vectors
CREATE OR REPLACE FUNCTION update_thread_search_vector() RETURNS TRIGGER AS $$
BEGIN
    NEW.search_vector :=
        setweight(to_tsvector('english', COALESCE(NEW.title, '')), 'A') ||
        setweight(to_tsvector('english', COALESCE(NEW.body, '')), 'B') ||
        setweight(to_tsvector('english', COALESCE(array_to_string(NEW.tags, ' '), '')), 'C');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER thread_search_update
    BEFORE INSERT OR UPDATE OF title, body, tags ON threads
    FOR EACH ROW EXECUTE FUNCTION update_thread_search_vector();

CREATE OR REPLACE FUNCTION update_comment_search_vector() RETURNS TRIGGER AS $$
BEGIN
    NEW.search_vector :=
        setweight(to_tsvector('english', COALESCE(NEW.body, '')), 'A') ||
        setweight(to_tsvector('english', COALESCE(array_to_string(NEW.tags, ' '), '')), 'B');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER comment_search_update
    BEFORE INSERT OR UPDATE OF body, tags ON comments
    FOR EACH ROW EXECUTE FUNCTION update_comment_search_vector();

CREATE OR REPLACE FUNCTION update_artifact_search_vector() RETURNS TRIGGER AS $$
BEGIN
    NEW.search_vector :=
        setweight(to_tsvector('english', COALESCE(NEW.title, '')), 'A') ||
        setweight(to_tsvector('english', COALESCE(NEW.summary, '')), 'B') ||
        setweight(to_tsvector('english', COALESCE(NEW.body, '')), 'C') ||
        setweight(to_tsvector('english', COALESCE(array_to_string(NEW.tags, ' '), '')), 'D');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER artifact_search_update
    BEFORE INSERT OR UPDATE OF title, summary, body, tags ON artifacts
    FOR EACH ROW EXECUTE FUNCTION update_artifact_search_vector();

-- Triggers for denormalized counts
CREATE OR REPLACE FUNCTION update_topic_thread_count() RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE topics SET thread_count = thread_count + 1 WHERE id = NEW.topic_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE topics SET thread_count = thread_count - 1 WHERE id = OLD.topic_id;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER thread_count_update
    AFTER INSERT OR DELETE ON threads
    FOR EACH ROW EXECUTE FUNCTION update_topic_thread_count();

CREATE OR REPLACE FUNCTION update_topic_artifact_count() RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE topics SET artifact_count = artifact_count + 1 WHERE id = NEW.topic_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE topics SET artifact_count = artifact_count - 1 WHERE id = OLD.topic_id;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER artifact_count_update
    AFTER INSERT OR DELETE ON artifacts
    FOR EACH ROW EXECUTE FUNCTION update_topic_artifact_count();

CREATE OR REPLACE FUNCTION update_thread_comment_count() RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE threads SET comment_count = comment_count + 1 WHERE id = NEW.thread_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE threads SET comment_count = comment_count - 1 WHERE id = OLD.thread_id;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER comment_count_update
    AFTER INSERT OR DELETE ON comments
    FOR EACH ROW EXECUTE FUNCTION update_thread_comment_count();

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at() RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER threads_updated_at
    BEFORE UPDATE ON threads
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER comments_updated_at
    BEFORE UPDATE ON comments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER artifacts_updated_at
    BEFORE UPDATE ON artifacts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER tasks_updated_at
    BEFORE UPDATE ON tasks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
