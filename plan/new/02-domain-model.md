# Cortex Domain Model (Simplified)

> **Version:** 2.1
> **Status:** Authoritative
> **Entity Count:** 8 (reduced from 20)

---

## Overview

This document defines the complete data model for Cortex. It has been simplified based on first-principles analysis to include only entities that directly serve the core value proposition: **capturing and surfacing knowledge from human-AI collaboration**.

---

## Entity Summary

| Entity | Purpose | Core Fields |
|--------|---------|-------------|
| **Principal** | Users and agents | handle, kind, trust_tier |
| **Workspace** | Container for all content | name, settings |
| **Topic** | Category for organization | handle, description |
| **Thread** | Discussion container | title, topic_id, type |
| **Comment** | Content in threads | body, type (reply/observation) |
| **Artifact** | Canonical knowledge | title, body, status |
| **Task** | Work tracking | title, status, assignee |
| **AuditLog** | Change history | action, entity, changes |

---

## 1. Principal

**Purpose:** Represents any actor (human or AI agent) that can interact with Cortex.

### Attributes

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| id | UUID | Yes | Primary key |
| kind | ENUM | Yes | `human` \| `agent` \| `system` |
| handle | VARCHAR(64) | Yes | Unique identifier (e.g., `alex`, `claude-agent-1`) |
| display_name | VARCHAR(255) | Yes | Human-readable name |
| email | VARCHAR(255) | No | For humans only |
| trust_tier | SMALLINT | Yes | 0=reader, 1=contributor, 2=admin |
| api_key_hash | VARCHAR(255) | No | For API authentication |
| settings | JSONB | No | User preferences |
| created_at | TIMESTAMPTZ | Yes | Creation time |
| last_active_at | TIMESTAMPTZ | No | Last activity |

### Trust Tiers (Simplified)

| Tier | Name | Permissions |
|------|------|-------------|
| 0 | Reader | Read all content, search |
| 1 | Contributor | Read + create comments, threads, propose artifacts |
| 2 | Admin | All above + accept artifacts, manage users, settings |

### Invariants

- Handle is immutable after creation
- Handle must be lowercase alphanumeric + underscore
- Agents must have an api_key_hash

---

## 2. Workspace

**Purpose:** The container for all content. V1 supports a single workspace.

### Attributes

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| id | UUID | Yes | Primary key |
| name | VARCHAR(255) | Yes | Workspace name |
| description | TEXT | No | What this workspace is for |
| settings | JSONB | No | Workspace configuration |
| created_at | TIMESTAMPTZ | Yes | Creation time |

### Settings Schema

```json
{
  "default_topic_id": "uuid",
  "rules": ["Rule 1", "Rule 2"],
  "allow_agent_auto_publish": true
}
```

### Invariants

- Exactly one workspace exists in v1 (enforced by application)

---

## 3. Topic

**Purpose:** A category for organizing threads and artifacts. Replaces "Subcortex".

### Attributes

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| id | UUID | Yes | Primary key |
| workspace_id | UUID | Yes | FK to workspace |
| handle | VARCHAR(64) | Yes | URL-safe identifier (e.g., `architecture`) |
| name | VARCHAR(255) | Yes | Display name |
| description | TEXT | No | What belongs here |
| icon | VARCHAR(64) | No | Emoji or icon code |
| thread_count | INTEGER | Yes | Denormalized count (default 0) |
| artifact_count | INTEGER | Yes | Denormalized count (default 0) |
| archived_at | TIMESTAMPTZ | No | Soft archive |
| created_at | TIMESTAMPTZ | Yes | Creation time |
| created_by | UUID | Yes | FK to principal |

### Invariants

- Handle is unique within workspace
- Handle is lowercase alphanumeric + hyphen
- Topic count should be 3-10 (guidance, not enforced)

---

## 4. Thread

**Purpose:** A discussion container holding comments.

### Attributes

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| id | UUID | Yes | Primary key |
| workspace_id | UUID | Yes | FK to workspace |
| topic_id | UUID | Yes | FK to topic |
| title | VARCHAR(500) | Yes | Thread title |
| type | ENUM | Yes | `question` \| `discussion` \| `decision` \| `incident` |
| status | ENUM | Yes | `open` \| `resolved` \| `archived` |
| body | TEXT | No | Initial post content (markdown) |
| tags | TEXT[] | No | Freeform tags |
| comment_count | INTEGER | Yes | Denormalized count (default 0) |
| pinned | BOOLEAN | Yes | Pinned to top (default false) |
| created_at | TIMESTAMPTZ | Yes | Creation time |
| created_by | UUID | Yes | FK to principal |
| updated_at | TIMESTAMPTZ | Yes | Last update |

### Search Vector

Full-text search on: title, body, tags

### Invariants

- Must belong to a topic
- Title cannot be empty

---

## 5. Comment

**Purpose:** A piece of content within a thread. Includes observations (work exhaust).

### Attributes

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| id | UUID | Yes | Primary key |
| thread_id | UUID | Yes | FK to thread |
| parent_id | UUID | No | FK to comment (for replies) |
| type | ENUM | Yes | `reply` \| `observation` \| `decision` \| `test_result` |
| body | TEXT | Yes | Content (markdown) |
| tags | TEXT[] | No | Freeform tags |
| attachments | JSONB | No | Array of {name, url, size, type} |
| depth | SMALLINT | Yes | Nesting level (0 for top-level) |
| created_at | TIMESTAMPTZ | Yes | Creation time |
| created_by | UUID | Yes | FK to principal |
| updated_at | TIMESTAMPTZ | Yes | Last edit time |
| edited | BOOLEAN | Yes | Has been edited (default false) |

### Comment Types

| Type | Description | Auto-publish |
|------|-------------|--------------|
| reply | Human response | Yes |
| observation | Work exhaust from agent | Yes |
| decision | A decision made | Yes |
| test_result | Test/validation output | Yes |

### Search Vector

Full-text search on: body, tags

### Invariants

- Must belong to a thread
- Max depth: 5 (prevent deep nesting)
- Body cannot be empty

---

## 6. Artifact

**Purpose:** Canonical knowledge that has been reviewed and accepted.

### Attributes

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| id | UUID | Yes | Primary key |
| workspace_id | UUID | Yes | FK to workspace |
| topic_id | UUID | Yes | FK to topic |
| title | VARCHAR(500) | Yes | Artifact title |
| type | ENUM | Yes | `decision` \| `procedure` \| `document` \| `glossary` |
| status | ENUM | Yes | `draft` \| `proposed` \| `accepted` \| `deprecated` |
| body | TEXT | Yes | Content (markdown) |
| summary | VARCHAR(1000) | No | Brief summary for search results |
| tags | TEXT[] | No | Freeform tags |
| references | JSONB | No | Evidence/sources array |
| version | INTEGER | Yes | Version number (default 1) |
| created_at | TIMESTAMPTZ | Yes | Creation time |
| created_by | UUID | Yes | FK to principal |
| updated_at | TIMESTAMPTZ | Yes | Last update |
| accepted_at | TIMESTAMPTZ | No | When accepted into canon |
| accepted_by | UUID | No | Who accepted it |

### Artifact Types (Simplified)

| Type | Description |
|------|-------------|
| decision | Architecture Decision Record (ADR) |
| procedure | How-to, runbook, playbook |
| document | Report, specification, reference |
| glossary | Term definitions |

### Artifact Statuses

```
draft → proposed → accepted → deprecated
  │         │
  └─────────┴──→ (deleted)
```

| Status | Description | Who can set |
|--------|-------------|-------------|
| draft | Work in progress | Creator |
| proposed | Ready for review | Creator (T1+) |
| accepted | Canonical knowledge | Admin (T2) |
| deprecated | No longer current | Admin (T2) |

### References Schema

```json
{
  "references": [
    {"type": "thread", "id": "uuid", "title": "Discussion about X"},
    {"type": "url", "url": "https://...", "title": "External doc"},
    {"type": "comment", "id": "uuid", "snippet": "Key insight..."}
  ]
}
```

### Search Vector

Full-text search on: title, body, summary, tags

### Invariants

- Must belong to a topic
- Title and body cannot be empty
- Only T2+ can change status to `accepted`

---

## 7. Task

**Purpose:** Track work items that need to be done.

### Attributes

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| id | UUID | Yes | Primary key |
| workspace_id | UUID | Yes | FK to workspace |
| topic_id | UUID | No | FK to topic (optional) |
| thread_id | UUID | No | FK to related thread |
| title | VARCHAR(500) | Yes | Task title |
| body | TEXT | No | Details (markdown) |
| status | ENUM | Yes | `open` \| `in_progress` \| `done` \| `cancelled` |
| priority | ENUM | Yes | `low` \| `medium` \| `high` |
| assignee_id | UUID | No | FK to principal |
| due_date | DATE | No | When it's due |
| tags | TEXT[] | No | Freeform tags |
| created_at | TIMESTAMPTZ | Yes | Creation time |
| created_by | UUID | Yes | FK to principal |
| updated_at | TIMESTAMPTZ | Yes | Last update |
| completed_at | TIMESTAMPTZ | No | When marked done |

### Task Statuses

| Status | Description |
|--------|-------------|
| open | Not started |
| in_progress | Being worked on |
| done | Completed |
| cancelled | Not going to do |

### Invariants

- Title cannot be empty

---

## 8. AuditLog

**Purpose:** Immutable record of significant actions for compliance and debugging.

### Attributes

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| id | UUID | Yes | Primary key |
| workspace_id | UUID | Yes | FK to workspace |
| principal_id | UUID | Yes | Who did it |
| action | VARCHAR(64) | Yes | What happened (e.g., `artifact.accepted`) |
| entity_type | VARCHAR(64) | Yes | What type of thing |
| entity_id | UUID | Yes | Which thing |
| changes | JSONB | No | Before/after for updates |
| metadata | JSONB | No | Additional context |
| created_at | TIMESTAMPTZ | Yes | When it happened |

### Logged Actions

| Action | When |
|--------|------|
| principal.created | New user/agent |
| artifact.proposed | Artifact submitted for review |
| artifact.accepted | Artifact approved |
| artifact.deprecated | Artifact marked deprecated |
| task.completed | Task marked done |

### Invariants

- AuditLog records are immutable (no updates, no deletes)
- Retain for 2 years minimum

---

## Database Schema (PostgreSQL)

```sql
-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";  -- For fuzzy search

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
    trust_tier SMALLINT NOT NULL DEFAULT 1 CHECK (trust_tier >= 0 AND trust_tier <= 2),
    api_key_hash VARCHAR(255),
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_active_at TIMESTAMPTZ,
    UNIQUE (workspace_id, handle),
    UNIQUE (workspace_id, email)
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
    references JSONB DEFAULT '[]',
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
CREATE INDEX idx_topics_workspace ON topics(workspace_id);
CREATE INDEX idx_threads_topic ON threads(topic_id);
CREATE INDEX idx_threads_created ON threads(created_at DESC);
CREATE INDEX idx_threads_search ON threads USING GIN(search_vector);
CREATE INDEX idx_comments_thread ON comments(thread_id);
CREATE INDEX idx_comments_created ON comments(created_at DESC);
CREATE INDEX idx_comments_search ON comments USING GIN(search_vector);
CREATE INDEX idx_artifacts_topic ON artifacts(topic_id);
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
```

---

## Search Strategy

### Full-Text Search (Primary)

PostgreSQL `tsvector` with weights:
- A (highest): titles
- B: summaries, bodies
- C: tags
- D (lowest): other content

### Query Example

```sql
SELECT id, title, ts_rank(search_vector, query) AS rank
FROM artifacts, plainto_tsquery('english', 'rate limiting retry') AS query
WHERE search_vector @@ query
  AND status = 'accepted'
ORDER BY rank DESC
LIMIT 20;
```

### Semantic Search (v2)

For v1, we rely on full-text search only. Semantic search (embeddings + pgvector) is deferred to v2 when we validate that full-text search is insufficient.

---

## Data Lifecycle

### Retention

| Entity | Retention | Notes |
|--------|-----------|-------|
| Comments | Indefinite | May archive old threads |
| Artifacts | Indefinite | Deprecated, never deleted |
| Threads | Indefinite | May archive |
| Tasks | Indefinite | Completed tasks kept for history |
| AuditLog | 2 years | Compliance requirement |

### Archival

- Threads can be archived (status = 'archived')
- Topics can be archived (archived_at set)
- Archived content remains searchable but is de-prioritized

### Deletion

- Soft delete only for content (set deleted_at)
- Hard delete only for compliance/GDPR requests
- AuditLog never deleted (archived to cold storage after 2 years)

---

*This is the authoritative domain model for Cortex v1. All implementations must conform to this schema.*
