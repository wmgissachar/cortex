# Implementation Plan: 9 Immediate Audit Fixes

> Date: February 9, 2026
> Scope: All 9 immediate fixes from `docs/audit-and-fixes.md`
> Status: Reviewed, corrected, ready for implementation
> Critical review: Applied 11 corrections (see Appendix A)

---

## Table of Contents

1. [Execution Order & Dependencies](#1-execution-order--dependencies)
2. [Phase A: Infrastructure](#2-phase-a-infrastructure)
3. [Phase B: Data Cleanup](#3-phase-b-data-cleanup)
4. [Phase C: Backend Features](#4-phase-c-backend-features)
5. [Phase D: MCP Tools](#5-phase-d-mcp-tools)
6. [Phase E: Frontend](#6-phase-e-frontend)
7. [Phase F: Documentation](#7-phase-f-documentation)
8. [Testing Matrix](#8-testing-matrix)
9. [Risk Assessment](#9-risk-assessment)
10. [File Change Manifest](#10-file-change-manifest)
11. [Appendix A: Critical Review Corrections](#appendix-a-critical-review-corrections)

---

## 1. Execution Order & Dependencies

### Dependency Graph

```
Phase A: Infrastructure (parallel)
  ├── A1: knowledge_links migration (Fix 5)
  ├── A2: audit-log repository (Fix 7)
  ├── A3: knowledge-link repository (Fix 5)
  └── A4: shared types (Fix 5, 7)

Phase B: Data Cleanup (after A, needs tag normalization decided)
  └── B1: cleanup SQL script (Fix 1)

Phase C: Backend Features (after A, parallel within)
  ├── C1: knowledge-links API routes (Fix 5)
  ├── C2: audit logging integration in services (Fix 7)
  ├── C3: tags endpoint + topic settings in SELECT (Fix 8)
  ├── C4: activity feed filtering + pagination (Fix 9)
  └── C5: deprecate() signature update for audit (Fix 7)

Phase D: MCP Tools (after C for Fix 5/6, parallel within)
  ├── D1: new cortex_update_thread tool (Fix 2)
  ├── D2: active thread state module (Fix 4)
  ├── D3: ID footer injection on all 15 tools (Fix 4)
  ├── D4: register update-thread in tool index (Fix 2)
  ├── D5: enrich cortex_get_context (Fix 6)
  └── D6: supersedes parameter in draft-artifact (Fix 5)

Phase E: Frontend (after C, parallel within)
  ├── E1: thread lifecycle UI (Fix 2)
  ├── E2: creation forms + editorial tools (Fix 3)
  ├── E3: supersession banner on artifacts (Fix 5)
  └── E4: activity feed improvements (Fix 9)

Phase F: Documentation (after D)
  └── F1: CLAUDE.md updates
```

### Execution Sequence

```
A1..A4 (parallel) → B1 → C1..C5 (parallel) → D1..D6 (parallel) + E1..E4 (parallel) → F1
```

**Justification for ordering:**
- Phase A creates the tables and types that Phase C depends on
- Phase B runs data cleanup after infrastructure is ready (tag normalization SQL references the finalized tag vocabulary)
- Phases D and E can run in parallel since they touch different packages (mcp vs web)
- Phase F updates documentation after the features exist

---

## 2. Phase A: Infrastructure

### A1. Database Migration: knowledge_links Table (Fix 5)

**NEW FILE: `packages/api/src/db/migrations/002_knowledge_links.sql`**

```sql
-- Migration 002: Knowledge links for artifact relationships
-- Supports: supersedes, supports, contradicts, depends_on, related_to

CREATE TYPE knowledge_link_type AS ENUM (
  'supersedes', 'supports', 'contradicts', 'depends_on', 'related_to'
);

CREATE TABLE knowledge_links (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_id UUID NOT NULL REFERENCES artifacts(id) ON DELETE CASCADE,
  target_id UUID NOT NULL REFERENCES artifacts(id) ON DELETE CASCADE,
  link_type knowledge_link_type NOT NULL,
  created_by UUID NOT NULL REFERENCES principals(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT no_self_link CHECK (source_id != target_id),
  UNIQUE (source_id, target_id, link_type)
);

CREATE INDEX idx_knowledge_links_source ON knowledge_links(source_id);
CREATE INDEX idx_knowledge_links_target ON knowledge_links(target_id);
CREATE INDEX idx_knowledge_links_type ON knowledge_links(link_type);
```

> **Critical review correction #1:** The enum type is named `knowledge_link_type` (not `link_type`) to avoid potential name collisions with PostgreSQL internals or future columns.

**MODIFY: `packages/api/src/db/index.ts`**

Add migration 002 to `runMigrations()` following the existing 001 pattern:

```typescript
// After the 001 migration block:
const migration002 = '002_knowledge_links';
const { rows: applied002 } = await client.query(
  `SELECT version FROM schema_migrations WHERE version = $1`, [migration002]
);
if (applied002.length === 0) {
  const sql002 = readFileSync(join(migrationsDir, '002_knowledge_links.sql'), 'utf-8');
  await client.query(sql002);
  await client.query(`INSERT INTO schema_migrations (version) VALUES ($1)`, [migration002]);
  console.log(`Migration ${migration002} applied`);
}
```

**Second-order effects:**
- The `ON DELETE CASCADE` means deleting an artifact removes all its knowledge links. This is correct — orphaned links to non-existent artifacts would be worse.
- The `UNIQUE (source_id, target_id, link_type)` constraint prevents duplicate links but allows two artifacts to have multiple different relationship types (e.g., both "supports" and "depends_on").

---

### A2. Audit Log Repository (Fix 7)

**NEW FILE: `packages/api/src/repositories/audit-log.repository.ts`**

```typescript
import db from '../db/index.js';

export interface AuditLogRow {
  id: string;
  workspace_id: string;
  principal_id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  changes: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  created_at: Date;
}

export const auditLogRepository = {
  async create(
    workspaceId: string,
    principalId: string,
    action: string,
    entityType: string,
    entityId: string,
    changes?: { before?: Record<string, unknown>; after?: Record<string, unknown> },
    metadata?: Record<string, unknown>
  ): Promise<AuditLogRow> {
    const { rows } = await db.query<AuditLogRow>(
      `INSERT INTO audit_logs (workspace_id, principal_id, action, entity_type, entity_id, changes, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        workspaceId, principalId, action, entityType, entityId,
        changes ? JSON.stringify(changes) : null,
        metadata ? JSON.stringify(metadata) : null,
      ]
    );
    return rows[0];
  },

  async findByEntity(entityType: string, entityId: string, limit = 20): Promise<AuditLogRow[]> {
    const { rows } = await db.query<AuditLogRow>(
      `SELECT * FROM audit_logs
       WHERE entity_type = $1 AND entity_id = $2
       ORDER BY created_at DESC
       LIMIT $3`,
      [entityType, entityId, limit]
    );
    return rows;
  },
};
```

> **Design note:** All audit logging calls in the service layer use fire-and-forget (`.catch(err => console.error('Audit log error:', err))`). This ensures audit failures never block the primary operation. The trade-off is that some audit entries could be lost under extreme conditions (disk full, pool exhaustion). This is acceptable — audit logs are forensic, not transactional.

---

### A3. Knowledge Link Repository (Fix 5)

**NEW FILE: `packages/api/src/repositories/knowledge-link.repository.ts`**

```typescript
import db from '../db/index.js';

export interface KnowledgeLinkRow {
  id: string;
  source_id: string;
  target_id: string;
  link_type: string;
  created_by: string;
  created_at: Date;
}

export interface KnowledgeLinkWithDetails extends KnowledgeLinkRow {
  source_title: string;
  source_status: string;
  target_title: string;
  target_status: string;
  creator_handle: string;
  creator_display_name: string;
}

export const knowledgeLinkRepository = {
  async create(
    sourceId: string, targetId: string, linkType: string, createdBy: string
  ): Promise<KnowledgeLinkRow> {
    const { rows } = await db.query<KnowledgeLinkRow>(
      `INSERT INTO knowledge_links (source_id, target_id, link_type, created_by)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [sourceId, targetId, linkType, createdBy]
    );
    return rows[0];
  },

  async findByArtifact(artifactId: string): Promise<KnowledgeLinkWithDetails[]> {
    const { rows } = await db.query<KnowledgeLinkWithDetails>(
      `SELECT kl.*,
              src.title AS source_title, src.status AS source_status,
              tgt.title AS target_title, tgt.status AS target_status,
              p.handle AS creator_handle, p.display_name AS creator_display_name
       FROM knowledge_links kl
       JOIN artifacts src ON kl.source_id = src.id
       JOIN artifacts tgt ON kl.target_id = tgt.id
       JOIN principals p ON kl.created_by = p.id
       WHERE kl.source_id = $1 OR kl.target_id = $1
       ORDER BY kl.created_at DESC`,
      [artifactId]
    );
    return rows;
  },

  async findSuperseder(artifactId: string): Promise<KnowledgeLinkWithDetails | null> {
    // Find the artifact that supersedes this one (source supersedes target)
    const { rows } = await db.query<KnowledgeLinkWithDetails>(
      `SELECT kl.*,
              src.title AS source_title, src.status AS source_status,
              tgt.title AS target_title, tgt.status AS target_status,
              p.handle AS creator_handle, p.display_name AS creator_display_name
       FROM knowledge_links kl
       JOIN artifacts src ON kl.source_id = src.id
       JOIN artifacts tgt ON kl.target_id = tgt.id
       JOIN principals p ON kl.created_by = p.id
       WHERE kl.target_id = $1 AND kl.link_type = 'supersedes'
       ORDER BY kl.created_at DESC
       LIMIT 1`,
      [artifactId]
    );
    return rows[0] || null;
  },

  async delete(id: string): Promise<boolean> {
    const { rowCount } = await db.query('DELETE FROM knowledge_links WHERE id = $1', [id]);
    return (rowCount ?? 0) > 0;
  },
};
```

**Semantic convention:** `source supersedes target` means the source is the newer artifact. When displaying on the deprecated artifact (the target), we show "Superseded by [source]".

---

### A4. Shared Types (Fix 5, Fix 7)

**NEW FILE: `packages/shared/src/types/knowledge-link.ts`**

```typescript
export type LinkType = 'supersedes' | 'supports' | 'contradicts' | 'depends_on' | 'related_to';

export interface KnowledgeLink {
  id: string;
  source_id: string;
  target_id: string;
  link_type: LinkType;
  created_by: string;
  created_at: Date;
}

export interface KnowledgeLinkWithDetails extends KnowledgeLink {
  source_title: string;
  source_status: string;
  target_title: string;
  target_status: string;
  creator_handle: string;
  creator_display_name: string;
}

export interface CreateKnowledgeLinkInput {
  source_id: string;
  target_id: string;
  link_type: LinkType;
}
```

**MODIFY: `packages/shared/src/types/index.ts`** — Add export:
```typescript
export * from './knowledge-link.js';
```

**MODIFY: `packages/shared/src/types/audit-log.ts`** — Extend AuditAction union:
```typescript
export type AuditAction =
  | 'principal.created' | 'principal.updated' | 'principal.deleted'
  | 'artifact.created' | 'artifact.proposed' | 'artifact.accepted' | 'artifact.deprecated'
  | 'thread.created' | 'thread.resolved' | 'thread.archived' | 'thread.reopened'
  | 'task.created' | 'task.started' | 'task.completed' | 'task.cancelled'
  | 'knowledge_link.created';
```

**MODIFY: `packages/shared/src/validation.ts`** — Add schema:
```typescript
export const createKnowledgeLinkSchema = z.object({
  source_id: z.string().uuid(),
  target_id: z.string().uuid(),
  link_type: z.enum(['supersedes', 'supports', 'contradicts', 'depends_on', 'related_to']),
});
```

---

## 3. Phase B: Data Cleanup (Fix 1)

> **Critical review correction #3:** The original plan used `updated_at < NOW() - INTERVAL '7 days'` to find threads to resolve. All existing threads were created Feb 6-9, 2026 — this criterion would match zero threads. Changed to explicit identification: resolve threads whose work is demonstrably complete based on content analysis, not arbitrary time windows.

**NEW FILE: `packages/api/src/db/scripts/cleanup-2026-02.sql`**

```sql
-- ============================================================
-- BATCH DATA CLEANUP — February 2026 Post-Audit
-- ============================================================
-- Execute: psql postgresql://postgres:YOUR_PASSWORD@localhost:5432/cortex -f cleanup-2026-02.sql
-- WARNING: Review SELECT previews before running. Back up database first.

-- ============================================================
-- PREVIEW QUERIES (run these first, do NOT wrap in transaction)
-- ============================================================

-- Preview: threads that will be resolved
-- Criteria: open, has comments, no open tasks referencing it
-- SELECT t.id, t.title, t.comment_count, t.created_at, t.updated_at
-- FROM threads t
-- LEFT JOIN tasks tk ON tk.thread_id = t.id AND tk.status IN ('open', 'in_progress')
-- WHERE t.status = 'open' AND t.comment_count > 0 AND tk.id IS NULL
--   AND t.title NOT LIKE 'Discussion:%'
-- ORDER BY t.created_at;

-- Preview: empty threads (candidates for deletion)
-- SELECT t.id, t.title, t.comment_count, t.created_at
-- FROM threads t
-- WHERE t.comment_count = 0 AND t.status = 'open'
--   AND t.title NOT LIKE 'Discussion:%'
--   AND t.id NOT IN (SELECT thread_id FROM tasks WHERE thread_id IS NOT NULL)
--   AND t.id NOT IN (SELECT thread_id FROM artifacts WHERE thread_id IS NOT NULL);

BEGIN;

-- 1. Resolve completed work threads
-- These are threads with observations/comments that represent finished work sessions.
-- Excludes auto-created "Discussion:" threads for artifacts.
-- IMPORTANT: Run the preview SELECT first to review the list.
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
-- These are shells that were created but never used.
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

-- 7. Deduplicate tag arrays (remove duplicate entries within each array)
UPDATE threads SET tags = (SELECT ARRAY(SELECT DISTINCT unnest(tags) ORDER BY 1))
WHERE array_length(tags, 1) > 0;
UPDATE comments SET tags = (SELECT ARRAY(SELECT DISTINCT unnest(tags) ORDER BY 1))
WHERE array_length(tags, 1) > 0;
UPDATE artifacts SET tags = (SELECT ARRAY(SELECT DISTINCT unnest(tags) ORDER BY 1))
WHERE array_length(tags, 1) > 0;
UPDATE tasks SET tags = (SELECT ARRAY(SELECT DISTINCT unnest(tags) ORDER BY 1))
WHERE array_length(tags, 1) > 0;

COMMIT;

-- ============================================================
-- VERIFICATION (run after COMMIT)
-- ============================================================
SELECT 'Remaining cold-start-embeddings tags' AS check,
  (SELECT COUNT(*) FROM threads WHERE 'cold-start-embeddings' = ANY(tags)) +
  (SELECT COUNT(*) FROM comments WHERE 'cold-start-embeddings' = ANY(tags)) +
  (SELECT COUNT(*) FROM artifacts WHERE 'cold-start-embeddings' = ANY(tags)) +
  (SELECT COUNT(*) FROM tasks WHERE 'cold-start-embeddings' = ANY(tags)) AS count;

SELECT 'Remaining implementation-plan tags' AS check,
  (SELECT COUNT(*) FROM threads WHERE 'implementation-plan' = ANY(tags)) AS count;

SELECT status, COUNT(*) FROM threads GROUP BY status ORDER BY status;
SELECT status, COUNT(*) FROM artifacts GROUP BY status ORDER BY status;
SELECT status, COUNT(*) FROM tasks GROUP BY status ORDER BY status;
```

**Second-order effects of data cleanup:**
- After resolving threads, `cortex_get_context` will show a mix of open and resolved threads. This is addressed in Fix 6 (Phase D5) by changing the default to fetch only open threads.
- Deprecating the ATH-FREQ pre-audit artifact makes the supersession visible to searchers immediately. The formal knowledge link (Fix 5) will be created after Phase C is done.
- Tag normalization affects search: queries for `cold-start-embeddings` will no longer match anything. This is intentional — the canonical tag is `cold-start`.

---

## 4. Phase C: Backend Features

### C1. Knowledge Links API Routes (Fix 5)

**NEW FILE: `packages/api/src/routes/knowledge-links.ts`**

```typescript
import type { FastifyInstance } from 'fastify';
import { createKnowledgeLinkSchema, AppError } from '@cortex/shared';
import { knowledgeLinkRepository } from '../repositories/knowledge-link.repository.js';
import { artifactRepository } from '../repositories/artifact.repository.js';
import { auditLogRepository } from '../repositories/audit-log.repository.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireContributor } from '../middleware/authorize.js';

export async function knowledgeLinksRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authenticate);

  // POST /knowledge-links — Create a relationship between two artifacts
  app.post('/', { preHandler: [requireContributor] }, async (request, reply) => {
    const input = createKnowledgeLinkSchema.parse(request.body);

    // Validate both artifacts exist and are in the same workspace
    const source = await artifactRepository.findById(input.source_id);
    if (!source) throw AppError.notFound('Source artifact');
    const target = await artifactRepository.findById(input.target_id);
    if (!target) throw AppError.notFound('Target artifact');
    if (source.workspace_id !== target.workspace_id) {
      throw AppError.validation('Artifacts must be in the same workspace');
    }

    const link = await knowledgeLinkRepository.create(
      input.source_id, input.target_id, input.link_type, request.user!.sub
    );

    // Fire-and-forget audit log
    auditLogRepository.create(
      source.workspace_id, request.user!.sub,
      'knowledge_link.created', 'knowledge_link', link.id,
      { after: { source_id: input.source_id, target_id: input.target_id, link_type: input.link_type } }
    ).catch(err => console.error('Audit log error:', err));

    reply.status(201);
    return { data: link, meta: { request_id: request.id } };
  });

  // GET /knowledge-links?artifact_id=... — Get all links for an artifact
  app.get('/', async (request, reply) => {
    const { artifact_id } = request.query as { artifact_id?: string };
    if (!artifact_id) throw AppError.validation('artifact_id query parameter is required');

    const links = await knowledgeLinkRepository.findByArtifact(artifact_id);
    return { data: links, meta: { request_id: request.id } };
  });

  // DELETE /knowledge-links/:id — Remove a link
  app.delete('/:id', { preHandler: [requireContributor] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const deleted = await knowledgeLinkRepository.delete(id);
    if (!deleted) throw AppError.notFound('Knowledge link');
    return { data: { deleted: true }, meta: { request_id: request.id } };
  });
}
```

**MODIFY: `packages/api/src/routes/artifacts.ts`** — Add links endpoint:

Add import at top:
```typescript
import { knowledgeLinkRepository } from '../repositories/knowledge-link.repository.js';
```

Add route (before the closing brace of the `artifactsRoutes` function):
```typescript
  // GET /artifacts/:id/links — Get relationships for an artifact
  app.get('/:id/links', async (request, reply) => {
    const { id } = request.params as { id: string };
    const artifact = await artifactService.getById(id); // verifies existence
    const links = await knowledgeLinkRepository.findByArtifact(id);
    const superseder = await knowledgeLinkRepository.findSuperseder(id);
    return {
      data: {
        links,
        superseded_by: superseder
          ? { id: superseder.source_id, title: superseder.source_title }
          : null,
      },
      meta: { request_id: request.id },
    };
  });
```

**MODIFY: `packages/api/src/index.ts`** — Register the new route module:

```typescript
import { knowledgeLinksRoutes } from './routes/knowledge-links.js';
// In the api.register section:
await api.register(knowledgeLinksRoutes, { prefix: '/knowledge-links' });
```

---

### C2. Audit Logging Integration (Fix 7)

All audit calls use fire-and-forget pattern. Each service method captures the result of the primary operation, logs asynchronously, then returns the result.

**MODIFY: `packages/api/src/services/artifact.service.ts`**

Add import:
```typescript
import { auditLogRepository } from '../repositories/audit-log.repository.js';
```

In `create()` — after `return this.getById(artifact.id)`, restructure:
```typescript
  async create(workspaceId, createdBy, input, creatorKind?) {
    // ... existing validation, thread creation, artifact creation ...
    if (creatorKind === 'agent') {
      await artifactRepository.updateStatus(artifact.id, 'accepted', createdBy);
    }

    const result = await this.getById(artifact.id);

    auditLogRepository.create(
      workspaceId, createdBy, 'artifact.created', 'artifact', artifact.id,
      { after: { title: input.title, type: input.type, status: result.status } }
    ).catch(err => console.error('Audit log error:', err));

    return result;
  },
```

In `propose()` — after successful status update:
```typescript
    auditLogRepository.create(
      existing.workspace_id, userId, 'artifact.proposed', 'artifact', id,
      { before: { status: 'draft' }, after: { status: 'proposed' } }
    ).catch(err => console.error('Audit log error:', err));
```

In `accept()` — after successful status update:
```typescript
    auditLogRepository.create(
      existing.workspace_id, adminId, 'artifact.accepted', 'artifact', id,
      { before: { status: 'proposed' }, after: { status: 'accepted' } }
    ).catch(err => console.error('Audit log error:', err));
```

In `deprecate()` — after successful status update (see C5 for signature change):
```typescript
    auditLogRepository.create(
      existing.workspace_id, userId, 'artifact.deprecated', 'artifact', id,
      { before: { status: 'accepted' }, after: { status: 'deprecated' } }
    ).catch(err => console.error('Audit log error:', err));
```

**MODIFY: `packages/api/src/services/thread.service.ts`**

Add import:
```typescript
import { auditLogRepository } from '../repositories/audit-log.repository.js';
```

In `create()`:
```typescript
    auditLogRepository.create(
      workspaceId, createdBy, 'thread.created', 'thread', thread.id,
      { after: { title: input.title, type: input.type || 'discussion', status: 'open' } }
    ).catch(err => console.error('Audit log error:', err));
```

In `update()` — only log when status changes:
```typescript
  async update(id: string, input: UpdateThreadInput): Promise<ThreadWithCreator> {
    // Capture before state if status is changing
    let beforeStatus: string | undefined;
    if (input.status) {
      const existing = await threadRepository.findById(id);
      beforeStatus = existing?.status;
    }

    const thread = await threadRepository.update(id, input);
    if (!thread) throw AppError.notFound('Thread');

    if (input.status && beforeStatus && input.status !== beforeStatus) {
      const actionMap: Record<string, string> = {
        resolved: 'thread.resolved', archived: 'thread.archived', open: 'thread.reopened',
      };
      auditLogRepository.create(
        thread.workspace_id, thread.created_by,
        actionMap[input.status] || `thread.${input.status}`,
        'thread', id,
        { before: { status: beforeStatus }, after: { status: input.status } }
      ).catch(err => console.error('Audit log error:', err));
    }

    return this.getById(id) as Promise<ThreadWithCreator>;
  },
```

**MODIFY: `packages/api/src/services/task.service.ts`**

Add import:
```typescript
import { auditLogRepository } from '../repositories/audit-log.repository.js';
```

In `create()`:
```typescript
    const result = await this.getById(task.id);
    auditLogRepository.create(
      workspaceId, createdBy, 'task.created', 'task', task.id,
      { after: { title: input.title, status: 'open', priority: input.priority || 'medium' } }
    ).catch(err => console.error('Audit log error:', err));
    return result;
```

In `update()` — log status changes:
```typescript
  async update(id: string, input: UpdateTaskInput): Promise<TaskWithRelations> {
    const existing = await taskRepository.findById(id);
    if (!existing) throw AppError.notFound('Task');

    const task = await taskRepository.update(id, input);
    if (!task) throw AppError.notFound('Task');

    if (input.status && input.status !== existing.status) {
      const actionMap: Record<string, string> = {
        in_progress: 'task.started', done: 'task.completed', cancelled: 'task.cancelled',
      };
      auditLogRepository.create(
        existing.workspace_id, existing.created_by,
        actionMap[input.status] || `task.${input.status}`,
        'task', id,
        { before: { status: existing.status }, after: { status: input.status } }
      ).catch(err => console.error('Audit log error:', err));
    }

    return this.getById(task.id);
  },
```

---

### C3. Tags Endpoint + Topic Settings (Fix 8)

The `topics.settings` JSONB column exists in the database schema (line 38 of 001_initial_schema.sql) but is not currently SELECTed by the topic repository. We need to add it to the queries and interface.

**MODIFY: `packages/api/src/repositories/topic.repository.ts`**

1. Add `settings` to the `TopicRow` interface:
```typescript
interface TopicRow {
  // ... existing fields ...
  settings: Record<string, unknown>;  // ADD THIS
}
```

2. Add `settings` to all SELECT queries in `findAll()`, `findById()`, `findByHandle()`:
```sql
SELECT id, workspace_id, handle, name, description, icon, settings,
       thread_count, artifact_count, ...
```

3. Add `getTagsInUse()` method:
```typescript
  async getTagsInUse(topicId: string): Promise<string[]> {
    const { rows } = await db.query<{ tag: string }>(
      `SELECT DISTINCT tag FROM (
         SELECT unnest(tags) AS tag FROM threads WHERE topic_id = $1
         UNION ALL
         SELECT unnest(c.tags) AS tag FROM comments c
           JOIN threads t ON c.thread_id = t.id WHERE t.topic_id = $1
         UNION ALL
         SELECT unnest(tags) AS tag FROM artifacts WHERE topic_id = $1
         UNION ALL
         SELECT unnest(tk.tags) AS tag FROM tasks tk WHERE tk.topic_id = $1
       ) all_tags
       WHERE tag IS NOT NULL
       ORDER BY tag`,
      [topicId]
    );
    return rows.map(r => r.tag);
  },
```

**MODIFY: `packages/api/src/services/topic.service.ts`** — Add method:
```typescript
  async getTagsInUse(topicId: string): Promise<string[]> {
    return topicRepository.getTagsInUse(topicId);
  },
```

**MODIFY: `packages/api/src/routes/topics.ts`** — Add endpoint:
```typescript
  // GET /topics/:id/tags — Suggested + in-use tags for a topic
  app.get('/:id/tags', async (request, reply) => {
    const { id } = request.params as { id: string };
    const topic = await topicService.getById(id);
    const settings = (topic as any).settings || {};
    const suggestedTags: string[] = settings.suggested_tags || [];
    const inUseTags = await topicService.getTagsInUse(id);
    const allTags = [...new Set([...suggestedTags, ...inUseTags])].sort();
    return {
      data: { suggested: suggestedTags, in_use: inUseTags, all: allTags },
      meta: { request_id: request.id },
    };
  });
```

> **Note on suggested_tags:** The `settings.suggested_tags` array is populated by the admin via direct database update or a future API endpoint. For now, the tags endpoint returns the `in_use` tags as the primary autocomplete source, with `suggested_tags` as an overlay for curated tag vocabulary. No UI for setting suggested tags is needed in this phase.

---

### C4. Activity Feed Filtering + Pagination (Fix 9)

**MODIFY: `packages/api/src/routes/activity.ts`**

Accept new query parameters:
```typescript
app.get('/', async (request, reply) => {
  const { limit, type, topic_id, offset } = request.query as {
    limit?: string; type?: string; topic_id?: string; offset?: string;
  };
  const parsedLimit = Math.min(parseInt(limit || '20', 10) || 20, 100);
  const parsedOffset = parseInt(offset || '0', 10) || 0;
  const validTypes = ['comment', 'thread', 'artifact', 'task'];
  const activityType = type && validTypes.includes(type) ? type : undefined;

  const items = await activityService.getRecent(
    request.user!.workspace_id, parsedLimit,
    { type: activityType, topicId: topic_id, offset: parsedOffset }
  );
  return {
    data: items,
    meta: {
      request_id: request.id,
      has_more: items.length === parsedLimit,
      offset: parsedOffset,
    },
  };
});
```

**MODIFY: `packages/api/src/services/activity.service.ts`** — Pass options through:
```typescript
export const activityService = {
  async getRecent(
    workspaceId: string, limit: number,
    options?: { type?: string; topicId?: string; offset?: number }
  ): Promise<ActivityItem[]> {
    return activityRepository.getRecent(workspaceId, limit, options);
  },
};
```

**MODIFY: `packages/api/src/repositories/activity.repository.ts`** — Dynamic query construction:

> **Critical review correction #5:** The plan must provide concrete SQL for the dynamic query, not handwave it. The tasks sub-query requires special topic handling because tasks can be linked to topics directly OR indirectly via threads.

```typescript
async getRecent(
  workspaceId: string, limit: number,
  options?: { type?: string; topicId?: string; offset?: number }
): Promise<ActivityItem[]> {
  const parts: string[] = [];
  const params: unknown[] = [workspaceId];
  let paramIdx = 2;
  const topicId = options?.topicId;

  // Build topic filter clause for each sub-query
  const buildTopicFilter = (topicCol: string): string => {
    if (!topicId) return '';
    params.push(topicId);
    return ` AND ${topicCol} = $${paramIdx++}`;
  };

  const buildTopicFilterForTasks = (): string => {
    if (!topicId) return '';
    params.push(topicId);
    return ` AND (tk.topic_id = $${paramIdx} OR th.topic_id = $${paramIdx++})`;
  };

  const includeType = (t: string) => !options?.type || options.type === t;

  if (includeType('comment')) {
    parts.push(`
      SELECT c.id, 'comment'::text AS activity_type, c.type::text, NULL::text AS title,
             LEFT(c.body, 300) AS body, c.created_at,
             c.thread_id, th.title AS thread_title,
             th.topic_id, tp.name AS topic_name,
             p.id AS creator_id, p.handle AS creator_handle,
             p.display_name AS creator_display_name, p.kind::text AS creator_kind
      FROM comments c
      JOIN threads th ON c.thread_id = th.id
      JOIN topics tp ON th.topic_id = tp.id
      JOIN principals p ON c.created_by = p.id
      WHERE th.workspace_id = $1${buildTopicFilter('th.topic_id')}`);
  }

  if (includeType('thread')) {
    parts.push(`
      SELECT t.id, 'thread'::text AS activity_type, t.type::text, t.title,
             LEFT(t.body, 300) AS body, t.created_at,
             t.id AS thread_id, t.title AS thread_title,
             t.topic_id, tp.name AS topic_name,
             p.id AS creator_id, p.handle AS creator_handle,
             p.display_name AS creator_display_name, p.kind::text AS creator_kind
      FROM threads t
      JOIN topics tp ON t.topic_id = tp.id
      JOIN principals p ON t.created_by = p.id
      WHERE t.workspace_id = $1${buildTopicFilter('t.topic_id')}`);
  }

  if (includeType('artifact')) {
    parts.push(`
      SELECT a.id, 'artifact'::text AS activity_type, a.type::text, a.title,
             LEFT(COALESCE(a.summary, a.body), 300) AS body, a.created_at,
             NULL::uuid AS thread_id, NULL::text AS thread_title,
             a.topic_id, tp.name AS topic_name,
             p.id AS creator_id, p.handle AS creator_handle,
             p.display_name AS creator_display_name, p.kind::text AS creator_kind
      FROM artifacts a
      JOIN topics tp ON a.topic_id = tp.id
      JOIN principals p ON a.created_by = p.id
      WHERE tp.workspace_id = $1${buildTopicFilter('a.topic_id')}`);
  }

  if (includeType('task')) {
    parts.push(`
      SELECT tk.id, 'task'::text AS activity_type, tk.status::text AS type, tk.title,
             LEFT(tk.body, 300) AS body, tk.created_at,
             tk.thread_id, th.title AS thread_title,
             COALESCE(tk.topic_id, th.topic_id) AS topic_id,
             COALESCE(tp_direct.name, tp_via_thread.name) AS topic_name,
             p.id AS creator_id, p.handle AS creator_handle,
             p.display_name AS creator_display_name, p.kind::text AS creator_kind
      FROM tasks tk
      LEFT JOIN threads th ON tk.thread_id = th.id
      LEFT JOIN topics tp_direct ON tk.topic_id = tp_direct.id
      LEFT JOIN topics tp_via_thread ON th.topic_id = tp_via_thread.id
      JOIN principals p ON tk.created_by = p.id
      WHERE tk.workspace_id = $1${buildTopicFilterForTasks()}`);
  }

  if (parts.length === 0) return [];

  const offsetVal = options?.offset || 0;
  params.push(limit, offsetVal);

  const query = `SELECT * FROM (${parts.join('\nUNION ALL\n')}) AS activity
    ORDER BY created_at DESC
    LIMIT $${paramIdx++} OFFSET $${paramIdx++}`;

  const { rows } = await db.query<ActivityItem>(query, params);
  return rows;
},
```

**Second-order effects:**
- The `offset`-based pagination is simpler than keyset pagination but slightly less performant on large datasets. This is acceptable for the activity feed (100s of items, not millions).
- Type filtering by conditionally omitting UNION members is more efficient than filtering after the UNION — the database doesn't scan tables it doesn't need.

---

### C5. Deprecate Signature Update (Fix 7)

The current `deprecate()` method at `artifact.service.ts:189` takes only `(id: string)`. It needs `userId` for audit logging.

**MODIFY: `packages/api/src/services/artifact.service.ts`** — Change signature:
```typescript
  async deprecate(id: string, userId: string): Promise<ArtifactWithCreator> {
    // ... existing validation ...
    const artifact = await artifactRepository.updateStatus(id, 'deprecated');
    if (!artifact) throw AppError.notFound('Artifact');

    auditLogRepository.create(
      existing.workspace_id, userId, 'artifact.deprecated', 'artifact', id,
      { before: { status: 'accepted' }, after: { status: 'deprecated' } }
    ).catch(err => console.error('Audit log error:', err));

    return this.getById(artifact.id);
  },
```

**MODIFY: `packages/api/src/routes/artifacts.ts`** — Pass userId:

Change line ~103 from:
```typescript
const artifact = await artifactService.deprecate(id);
```
To:
```typescript
const artifact = await artifactService.deprecate(id, request.user!.sub);
```

---

## 5. Phase D: MCP Tools

### D1. New `cortex_update_thread` Tool (Fix 2)

**MODIFY: `packages/mcp/src/client.ts`** — Add methods:

```typescript
  async updateThread(id: string, updates: {
    status?: string; title?: string; type?: string;
    body?: string; tags?: string[]; pinned?: boolean;
  }): Promise<ThreadWithCreator> {
    return this.request<ThreadWithCreator>(`/threads/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
  }

  async createKnowledgeLink(input: {
    source_id: string; target_id: string; link_type: string;
  }): Promise<{ id: string }> {
    return this.request<{ id: string }>('/knowledge-links', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  async getArtifactLinks(artifactId: string): Promise<{
    links: Array<{
      id: string; source_id: string; target_id: string;
      link_type: string; source_title: string; target_title: string;
    }>;
    superseded_by: { id: string; title: string } | null;
  }> {
    return this.request(`/artifacts/${artifactId}/links`);
  }
```

**NEW FILE: `packages/mcp/src/tools/update-thread.ts`**

```typescript
import { z } from 'zod';
import { client } from '../client.js';
import { getActiveThreadId } from './state.js';

export const updateThreadSchema = z.object({
  id: z.string().uuid().describe('Thread ID to update'),
  status: z.enum(['open', 'resolved', 'archived']).optional()
    .describe('New thread status'),
  title: z.string().min(1).max(500).optional()
    .describe('New thread title'),
  type: z.enum(['question', 'discussion', 'decision', 'incident']).optional()
    .describe('New thread type'),
  body: z.string().max(50000).optional()
    .describe('New thread body'),
  tags: z.array(z.string().max(64)).max(20).optional()
    .describe('New tags (replaces existing)'),
  pinned: z.boolean().optional()
    .describe('Pin or unpin the thread'),
});

export type UpdateThreadInput = z.infer<typeof updateThreadSchema>;

export const updateThreadTool = {
  name: 'cortex_update_thread',
  description:
    'Update a thread\'s status, title, or other properties. ' +
    'Use this to resolve threads when work is complete, archive old discussions, ' +
    'or update thread metadata.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      id: { type: 'string', format: 'uuid', description: 'Thread ID to update' },
      status: {
        type: 'string', enum: ['open', 'resolved', 'archived'],
        description: 'New thread status',
      },
      title: { type: 'string', description: 'New thread title', minLength: 1, maxLength: 500 },
      type: {
        type: 'string', enum: ['question', 'discussion', 'decision', 'incident'],
        description: 'New thread type',
      },
      body: { type: 'string', description: 'New thread body', maxLength: 50000 },
      tags: {
        type: 'array', items: { type: 'string', maxLength: 64 }, maxItems: 20,
        description: 'New tags (replaces existing)',
      },
      pinned: { type: 'boolean', description: 'Pin or unpin the thread' },
    },
    required: ['id'],
  },

  async execute(input: UpdateThreadInput): Promise<string> {
    try {
      const updates: Record<string, unknown> = {};
      if (input.status !== undefined) updates.status = input.status;
      if (input.title !== undefined) updates.title = input.title;
      if (input.type !== undefined) updates.type = input.type;
      if (input.body !== undefined) updates.body = input.body;
      if (input.tags !== undefined) updates.tags = input.tags;
      if (input.pinned !== undefined) updates.pinned = input.pinned;

      const thread = await client.updateThread(input.id, updates);

      let output = `# Thread Updated\n\n`;
      output += `- **Thread ID:** \`${thread.id}\`\n`;
      output += `- **Title:** ${thread.title}\n`;
      output += `- **Status:** ${thread.status}\n`;
      output += `- **Type:** ${thread.type}\n`;
      output += `- **Updated at:** ${new Date(thread.updated_at).toISOString()}\n`;

      if (input.status === 'resolved') {
        output += `\n> Thread resolved. Future agents will see this as completed work.\n`;
      }

      const activeId = getActiveThreadId();
      if (activeId) {
        output += `\n---\n> Active thread: \`${activeId}\``;
      }

      return output;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('not found') || message.includes('404')) {
        return (
          `# Error: Thread not found\n\n` +
          `Thread \`${input.id}\` does not exist.\n\n` +
          `## How to fix\n\n` +
          `1. Use \`cortex_list_threads\` to find valid thread IDs\n` +
          `2. Check that the ID is correct — UUIDs are easy to truncate accidentally`
        );
      }
      throw error;
    }
  },
};
```

---

### D2. Active Thread State Module (Fix 4)

**NEW FILE: `packages/mcp/src/tools/state.ts`**

```typescript
/**
 * Session-level state for the MCP server process.
 * The MCP server is a long-running stdio process — module-level variables
 * persist across all tool calls within a single session.
 */

let _activeThreadId: string | null = null;

export function setActiveThreadId(id: string): void {
  _activeThreadId = id;
}

export function getActiveThreadId(): string | null {
  return _activeThreadId || process.env.CORTEX_CHECKPOINT_THREAD_ID || null;
}

/**
 * Appends the active thread footer to a tool response string.
 * Returns the response unchanged if no active thread is set.
 */
export function appendActiveThreadFooter(output: string): string {
  const activeId = getActiveThreadId();
  if (!activeId) return output;
  return output + `\n\n---\n> Active thread: \`${activeId}\``;
}
```

> **Design justification:** The MCP server runs as a child process via stdio transport. It starts once and handles all tool calls for the session. Module-level state persists for the entire session lifecycle. If the process restarts (crash, relaunch), the env var `CORTEX_CHECKPOINT_THREAD_ID` provides a fallback. The `appendActiveThreadFooter` helper standardizes the footer format across all 16 tools.

---

### D3. ID Footer Injection on All Tools (Fix 4)

Each existing tool file gets two changes:

1. Add import: `import { appendActiveThreadFooter } from './state.js';`
2. Wrap the return value: `return appendActiveThreadFooter(output);`

> **Critical review correction #9:** Some tools (like `draft-artifact.ts`) already end with `---` separator. The `appendActiveThreadFooter` function adds another `---`, producing adjacent separators. This is acceptable — markdown renderers handle consecutive horizontal rules correctly, and the visual separation helps agents identify the footer.

**Special case: `create-thread.ts`** — Also sets the active thread ID:

```typescript
import { setActiveThreadId, appendActiveThreadFooter } from './state.js';

// After thread creation succeeds (before return):
setActiveThreadId(thread.id);
```

**Files requiring changes (15 existing + 1 new = 16 total):**

| File | Changes |
|------|---------|
| `create-thread.ts` | Import state, call `setActiveThreadId`, wrap return |
| `get-context.ts` | Import state, wrap return (also modified for D5) |
| `search.ts` | Import state, wrap return |
| `get-thread.ts` | Import state, wrap return |
| `get-artifact.ts` | Import state, wrap return |
| `observe.ts` | Import state, wrap return |
| `draft-artifact.ts` | Import state, wrap return (also modified for D6) |
| `update-task.ts` | Import state, wrap return |
| `checkpoint.ts` | Import state, wrap return |
| `create-task.ts` | Import state, wrap return |
| `get-task.ts` | Import state, wrap return |
| `update-artifact.ts` | Import state, wrap return |
| `list-threads.ts` | Import state, wrap return |
| `list-tasks.ts` | Import state, wrap return |
| `list-artifacts.ts` | Import state, wrap return |
| `update-thread.ts` | Already has footer (built into D1) |

---

### D4. Register update-thread in Tool Index (Fix 2)

**MODIFY: `packages/mcp/src/tools/index.ts`** — Six changes:

1. **Add import** (line ~23):
```typescript
import { updateThreadTool, updateThreadSchema, type UpdateThreadInput } from './update-thread.js';
```

2. **Add to toolDefinitions array** (after listArtifactsTool entry):
```typescript
  {
    name: updateThreadTool.name,
    description: updateThreadTool.description,
    inputSchema: updateThreadTool.inputSchema,
  },
```

3. **Add to exports** (after listArtifactsSchema):
```typescript
  updateThreadTool,
  updateThreadSchema,
  type UpdateThreadInput,
```

4. **Add to TOOL_NAMES** (after LIST_ARTIFACTS):
```typescript
  UPDATE_THREAD: 'cortex_update_thread',
```

5. **Add to toolSchemas** (after LIST_ARTIFACTS entry):
```typescript
  [TOOL_NAMES.UPDATE_THREAD]: updateThreadSchema,
```

6. **Add switch case** (after LIST_ARTIFACTS case):
```typescript
    case TOOL_NAMES.UPDATE_THREAD: {
      const input = updateThreadSchema.parse(args);
      return updateThreadTool.execute(input);
    }
```

---

### D5. Enrich `cortex_get_context` (Fix 6)

**MODIFY: `packages/mcp/src/tools/get-context.ts`**

Schema changes:
```typescript
export const getContextSchema = z.object({
  budget: z.number().int().min(1000).max(32000).default(6000).optional()
    .describe('Maximum characters to return (default: 6000)'),
  topic_id: z.string().uuid().optional()
    .describe('Scope context to a specific topic'),
});
```

Add to inputSchema properties:
```typescript
  topic_id: {
    type: 'string', format: 'uuid',
    description: 'Scope context to a specific topic for focused orientation',
  },
```

Execute changes — add topic-scoped branch:
```typescript
async execute(input: GetContextInput): Promise<string> {
  const budget = input.budget || 6000;

  if (input.topic_id) {
    return this.executeTopicScoped(input.topic_id, budget);
  }

  // Existing default implementation, but change thread fetch to open-only:
  const context = await client.getContext();
  // ... existing budget-managed output building ...
  // CHANGE: filter recent_threads to show open threads first
  const openThreads = context.recent_threads.filter(t => t.status === 'open');
  const resolvedThreads = context.recent_threads.filter(t => t.status !== 'open');
  const orderedThreads = [...openThreads, ...resolvedThreads];
  // Use orderedThreads instead of context.recent_threads
}
```

> **Critical review correction #8:** After Fixes 1 and 2 resolve many threads, the default `get_context` would show mostly resolved threads — noise for orientation. Changed to prioritize open threads in the listing, with resolved threads shown after if budget allows.

Add topic-scoped method:
```typescript
private async executeTopicScoped(topicId: string, budget: number): Promise<string> {
  const [topic, threads, artifacts, tasks] = await Promise.all([
    client.getTopic(topicId),
    client.getThreads({ topicId, limit: 15 }),
    client.getArtifacts({ topicId, status: 'accepted', limit: 10 }),
    client.getTasks({ status: 'open', limit: 10 }),
  ]);

  let output = '';
  let remaining = budget;

  // Header
  const header = `# Topic: ${topic.name}\n\n${topic.description || ''}\n\n`;
  output += header; remaining -= header.length;

  // Open threads first, then resolved
  const openThreads = threads.filter(t => t.status === 'open');
  const resolvedThreads = threads.filter(t => t.status === 'resolved');

  if (remaining > 100 && openThreads.length > 0) {
    const section = `## Active Threads (${openThreads.length})\n`;
    output += section; remaining -= section.length;
    for (const t of openThreads) {
      const line = `- [${t.type}] **${t.title}** (id: \`${t.id}\`, ${t.comment_count} comments)\n`;
      if (line.length <= remaining) { output += line; remaining -= line.length; }
    }
  }

  // Recent Decisions
  const decisions = artifacts.filter(a => a.type === 'decision');
  if (remaining > 100 && decisions.length > 0) {
    const section = `\n## Recent Decisions\n`;
    output += section; remaining -= section.length;
    for (const d of decisions) {
      const line = `- **${d.title}** (id: \`${d.id}\`): ${d.summary || '(no summary)'}\n`;
      if (line.length <= remaining) { output += line; remaining -= line.length; }
    }
  }

  // Other artifacts
  const nonDecisions = artifacts.filter(a => a.type !== 'decision');
  if (remaining > 100 && nonDecisions.length > 0) {
    const section = `\n## Documentation & Procedures\n`;
    output += section; remaining -= section.length;
    for (const a of nonDecisions) {
      const line = `- **${a.title}** [${a.type}]: ${a.summary || '(no summary)'}\n`;
      if (line.length <= remaining) { output += line; remaining -= line.length; }
    }
  }

  // Open tasks for this topic
  const topicTasks = tasks.filter(t => t.topic_id === topicId);
  if (remaining > 100 && topicTasks.length > 0) {
    const section = `\n## Open Tasks\n`;
    output += section; remaining -= section.length;
    for (const t of topicTasks) {
      const line = `- [${t.priority}] **${t.title}** (id: \`${t.id}\`)\n`;
      if (line.length <= remaining) { output += line; remaining -= line.length; }
    }
  }

  // Resolved threads (if budget allows)
  if (remaining > 100 && resolvedThreads.length > 0) {
    const section = `\n## Recently Resolved (${resolvedThreads.length})\n`;
    output += section; remaining -= section.length;
    for (const t of resolvedThreads.slice(0, 5)) {
      const line = `- ~~${t.title}~~ (${t.comment_count} comments)\n`;
      if (line.length <= remaining) { output += line; remaining -= line.length; }
    }
  }

  return appendActiveThreadFooter(output);
}
```

---

### D6. Supersedes Parameter in draft-artifact (Fix 5)

**MODIFY: `packages/mcp/src/tools/draft-artifact.ts`**

Add to schema:
```typescript
  supersedes: z.string().uuid().optional()
    .describe('ID of artifact this one supersedes (creates a knowledge link)'),
```

Add to inputSchema properties:
```typescript
  supersedes: {
    type: 'string', format: 'uuid',
    description: 'ID of artifact this supersedes',
  },
```

> **Critical review correction #7:** Validate the superseded artifact exists BEFORE creating the new artifact, not after. This prevents creating an artifact that claims to supersede a non-existent one.

In execute(), before `client.createArtifact()`:
```typescript
  // Validate superseded artifact exists
  if (input.supersedes) {
    try {
      await client.getArtifact(input.supersedes);
    } catch {
      return `# Error: Cannot supersede\n\nArtifact \`${input.supersedes}\` does not exist. ` +
        `Verify the ID with \`cortex_get_artifact\` or \`cortex_list_artifacts\`.`;
    }
  }

  const artifact = await client.createArtifact({ ... });
```

After artifact creation, create the knowledge link:
```typescript
  if (input.supersedes) {
    try {
      await client.createKnowledgeLink({
        source_id: artifact.id,
        target_id: input.supersedes,
        link_type: 'supersedes',
      });
      output += `- **Supersedes:** Artifact \`${input.supersedes}\` (knowledge link created)\n`;
    } catch (err) {
      output += `\n> Warning: Artifact created successfully but supersession link failed: ` +
        `${err instanceof Error ? err.message : String(err)}\n`;
    }
  }
```

**Non-atomicity justification:** The artifact creation and link creation are separate API calls. If the link creation fails, the artifact still exists but without the supersession relationship. This is acceptable because: (1) the artifact is still valid, (2) the link can be created manually later via `POST /knowledge-links`, (3) wrapping in a transaction would require a new combined API endpoint that adds complexity disproportionate to the risk.

---

## 6. Phase E: Frontend

### E1. Thread Lifecycle UI (Fix 2)

**MODIFY: `packages/web/src/pages/Thread.tsx`**

Add imports:
```typescript
import { useUpdateThread } from '../api/hooks/useThreads';
import { useAuthStore } from '../store/auth.store';
```

Add hooks:
```typescript
const updateThread = useUpdateThread();
const { isContributor } = useAuthStore();
```

Add action buttons in the thread header (after the badges row, visible to contributors):
```tsx
{isContributor() && thread.status === 'open' && (
  <div className="flex gap-2">
    <Button variant="secondary" size="sm"
      onClick={() => updateThread.mutate({ id: id!, status: 'resolved' })}
      loading={updateThread.isPending}>
      Resolve
    </Button>
    <Button variant="ghost" size="sm"
      onClick={() => updateThread.mutate({ id: id!, status: 'archived' })}
      loading={updateThread.isPending}>
      Archive
    </Button>
  </div>
)}
{isContributor() && thread.status === 'resolved' && (
  <div className="flex gap-2">
    <Button variant="secondary" size="sm"
      onClick={() => updateThread.mutate({ id: id!, status: 'open' })}
      loading={updateThread.isPending}>
      Reopen
    </Button>
    <Button variant="ghost" size="sm"
      onClick={() => updateThread.mutate({ id: id!, status: 'archived' })}
      loading={updateThread.isPending}>
      Archive
    </Button>
  </div>
)}
```

---

### E2. Creation Forms + Editorial Tools (Fix 3)

#### E2a. Topic.tsx — New Thread + New Artifact

**MODIFY: `packages/web/src/pages/Topic.tsx`**

Add imports and state:
```typescript
import { useCreateThread } from '../api/hooks/useThreads';
import { useCreateArtifact } from '../api/hooks/useArtifacts';
import { useAuthStore } from '../store/auth.store';
import { Button, Input } from '../components/common';

const [showNewThread, setShowNewThread] = useState(false);
const [showNewArtifact, setShowNewArtifact] = useState(false);
const createThread = useCreateThread();
const createArtifact = useCreateArtifact();
const { isContributor } = useAuthStore();
```

Add "New Thread" / "New Artifact" buttons above tabs (visible to contributors):
```tsx
{isContributor() && (
  <div className="flex gap-2 mb-4">
    <Button size="sm" onClick={() => setShowNewThread(!showNewThread)}>
      New Thread
    </Button>
    <Button size="sm" variant="secondary"
      onClick={() => setShowNewArtifact(!showNewArtifact)}>
      New Artifact
    </Button>
  </div>
)}
```

New Thread form (inline Card, shown when `showNewThread` is true):
- Fields: title (text input, required), type (select: discussion/question/decision/incident), body (textarea), tags (text input, comma-separated)
- Submit calls: `createThread.mutate({ topic_id: id!, title, type, body, tags: tagsStr.split(',').map(t => t.trim()).filter(Boolean) })`
- On success: reset form, close, invalidate thread list

New Artifact form (similar pattern):
- Fields: title (required), type (select: document/decision/procedure/glossary), summary (textarea), body (textarea, required), tags
- Submit calls: `createArtifact.mutate({ topic_id: id!, title, type, body, summary, tags })`

#### E2b. Tasks.tsx — New Task + Task Editing

**MODIFY: `packages/web/src/pages/Tasks.tsx`**

Add "New Task" button and form:
- Fields: title (required), body (textarea), priority (select: low/medium/high), due_date (date input), tags
- Submit calls: `createTask.mutate({ title, body, priority, due_date, tags })`

Add inline edit capability:
- Each task card gets an "Edit" button (visible to contributors)
- Edit mode: shows input fields replacing display text
- Save/Cancel buttons
- Save calls: `updateTask.mutate({ id, title, body, priority, due_date, tags })`

#### E2c. Artifact.tsx — Deprecate Button

**MODIFY: `packages/web/src/api/hooks/useArtifacts.ts`** — Add hook:
```typescript
export function useDeprecateArtifact() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const response = await client.post<{ data: ArtifactWithCreator }>(`/artifacts/${id}/deprecate`);
      return response.data.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['artifacts'] });
      queryClient.setQueryData(['artifacts', data.id], data);
    },
  });
}
```

**MODIFY: `packages/web/src/pages/Artifact.tsx`**

Add Deprecate button (visible when admin AND artifact.status === 'accepted'):
```tsx
{isAdmin() && artifact.status === 'accepted' && (
  <Button variant="danger" size="sm"
    onClick={() => {
      if (confirm('Deprecate this artifact? This marks it as outdated.')) {
        deprecateArtifact.mutate(id!);
      }
    }}
    loading={deprecateArtifact.isPending}>
    Deprecate
  </Button>
)}
```

---

### E3. Supersession Banner on Artifacts (Fix 5)

**MODIFY: `packages/web/src/api/hooks/useArtifacts.ts`** — Add hook:
```typescript
export function useArtifactLinks(artifactId: string | undefined) {
  return useQuery({
    queryKey: ['artifact-links', artifactId],
    queryFn: async () => {
      const response = await client.get<{
        data: {
          links: KnowledgeLinkWithDetails[];
          superseded_by: { id: string; title: string } | null;
        }
      }>(`/artifacts/${artifactId}/links`);
      return response.data.data;
    },
    enabled: !!artifactId,
  });
}
```

**MODIFY: `packages/web/src/pages/Artifact.tsx`**

Fetch links data:
```typescript
const { data: linksData } = useArtifactLinks(id);
```

Add supersession banner between breadcrumb and artifact card:
```tsx
{linksData?.superseded_by && (
  <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
    <p className="text-amber-800">
      This artifact has been superseded by{' '}
      <Link to={`/artifacts/${linksData.superseded_by.id}`}
        className="font-medium underline">
        {linksData.superseded_by.title}
      </Link>
    </p>
  </div>
)}
{artifact.status === 'deprecated' && !linksData?.superseded_by && (
  <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
    <p className="text-red-800">This artifact has been deprecated.</p>
  </div>
)}
```

---

### E4. Activity Feed Improvements (Fix 9)

> **Critical review correction #2:** The `useRecentActivity` hook currently returns `response.data.data` (an array). Changing it to return the full response object would break Topics.tsx. Solution: keep returning the array, and add `has_more` tracking separately.

**MODIFY: `packages/web/src/api/hooks/useActivity.ts`**

```typescript
interface ActivityQueryOptions {
  limit?: number;
  type?: string;
  topicId?: string;
  offset?: number;
}

export function useRecentActivity(options: ActivityQueryOptions | number = 10) {
  // Backward compatible: accept a number (old API) or options object
  const opts = typeof options === 'number'
    ? { limit: options }
    : options;
  const { limit = 10, type, topicId, offset = 0 } = opts;

  return useQuery({
    queryKey: ['activity', { limit, type, topicId, offset }],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set('limit', limit.toString());
      if (type) params.set('type', type);
      if (topicId) params.set('topic_id', topicId);
      if (offset) params.set('offset', offset.toString());
      const response = await client.get<ActivityResponse>(`/activity?${params}`);
      return response.data.data; // Returns array, maintaining backward compatibility
    },
    refetchInterval: 30000,
  });
}
```

> **Note:** The hook signature accepts both `number` (old API) and `ActivityQueryOptions` (new API) for backward compatibility. Existing `useRecentActivity(10)` calls continue to work.

**MODIFY: `packages/web/src/pages/Topics.tsx`**

Changes:
1. State for filters:
```typescript
const [activityFilter, setActivityFilter] = useState<string>('all');
const [highlightsOnly, setHighlightsOnly] = useState(false);
const [activityPage, setActivityPage] = useState(0);
const ACTIVITY_LIMIT = 25;
```

2. Use new hook API:
```typescript
const { data: activity } = useRecentActivity({
  limit: ACTIVITY_LIMIT,
  type: activityFilter === 'all' ? undefined : activityFilter,
  offset: activityPage * ACTIVITY_LIMIT,
});
```

3. Add filter buttons above activity list:
```tsx
<div className="flex gap-2 mb-3 flex-wrap">
  {['all', 'thread', 'artifact', 'comment', 'task'].map(t => (
    <button key={t}
      className={`px-3 py-1 text-sm rounded-full ${
        activityFilter === t ? 'bg-cortex-600 text-white' : 'bg-gray-100 text-gray-600'
      }`}
      onClick={() => { setActivityFilter(t); setActivityPage(0); }}>
      {t === 'all' ? 'All' : t.charAt(0).toUpperCase() + t.slice(1) + 's'}
    </button>
  ))}
  <label className="ml-auto flex items-center gap-1 text-sm text-gray-500">
    <input type="checkbox" checked={highlightsOnly}
      onChange={e => setHighlightsOnly(e.target.checked)} />
    Highlights only
  </label>
</div>
```

4. Visual differentiation in activity items:
```tsx
// For each activity item, apply conditional styles:
const itemClass = item.activity_type === 'artifact'
  ? 'py-4 bg-cortex-50/50 border-l-2 border-cortex-300'
  : item.body?.startsWith('## Checkpoint')
    ? 'py-2 opacity-60'
    : 'py-3';
```

5. Client-side highlights filter:
```typescript
const filteredActivity = highlightsOnly
  ? activity?.filter(a =>
      a.activity_type === 'artifact' ||
      (a.activity_type === 'comment' && a.type === 'decision')
    )
  : activity;
```

6. "Load More" button:
```tsx
{activity && activity.length === ACTIVITY_LIMIT && (
  <button onClick={() => setActivityPage(p => p + 1)}
    className="w-full py-2 text-sm text-cortex-600 hover:bg-gray-50 rounded">
    Load More
  </button>
)}
```

---

## 7. Phase F: Documentation

**MODIFY: `CLAUDE.md`** — Add after the "Continuous Documentation" section:

```markdown
## Thread Lifecycle

Threads follow the lifecycle: `open` -> `resolved` -> `archived`

- When finishing a session or completing work, **resolve your thread:**
  `cortex_update_thread({ id: "...", status: "resolved" })`
- Post a final summary observation before resolving
- Use `resolved` for completed work, `archived` for permanently closed discussions
- You can reopen a resolved thread if work resumes on it

### End-of-session checklist
1. Post a final observation summarizing what was accomplished
2. Resolve the session thread via `cortex_update_thread`
3. Create Cortex tasks for any identified follow-up work

## Artifact Supersession

When creating an artifact that replaces or updates an older one, use the `supersedes` parameter:
```
cortex_draft_artifact({ title: "...", body: "...", type: "...", topic_id: "...", supersedes: "<old-artifact-id>" })
```
This creates a knowledge link and the old artifact will show a supersession banner. The old artifact should then be deprecated.
```

---

## 8. Testing Matrix

### Fix 1: Batch Data Cleanup

| Test | Method | Expected |
|------|--------|----------|
| Tags normalized | SQL: `SELECT COUNT(*) FROM threads WHERE 'cold-start-embeddings' = ANY(tags)` | 0 |
| Tags normalized | SQL: `SELECT COUNT(*) FROM threads WHERE 'implementation-plan' = ANY(tags)` | 0 |
| Threads resolved | SQL: `SELECT COUNT(*) FROM threads WHERE status = 'resolved'` | >0 |
| ATH-FREQ deprecated | SQL: `SELECT title, status FROM artifacts WHERE title ILIKE '%ATH-FREQ%'` | Pre-audit = deprecated |
| Stale tasks cancelled | SQL: `SELECT COUNT(*) FROM tasks WHERE status = 'open' AND updated_at < NOW() - INTERVAL '2 days'` | 0 |

### Fix 2: Thread Lifecycle

| Test | Method | Expected |
|------|--------|----------|
| MCP resolve thread | `cortex_update_thread({id: "...", status: "resolved"})` | Status changes, response shows "resolved" |
| MCP reopen thread | `cortex_update_thread({id: "...", status: "open"})` | Status reverts |
| UI Resolve button | Click Resolve on open thread | Badge changes to "resolved" |
| UI Reopen button | Click Reopen on resolved thread | Badge changes to "open" |
| Invalid thread ID | Call with nonexistent UUID | Helpful error with recovery instructions |
| API verification | `curl PATCH /v1/threads/:id -d '{"status":"resolved"}'` | 200 response |

### Fix 3: Human Editorial Tools

| Test | Method | Expected |
|------|--------|----------|
| New Thread form | Fill form on Topic page, submit | Thread appears in list |
| New Artifact form | Fill form on Topic page, submit | Artifact created (draft or auto-accepted) |
| New Task form | Fill form on Tasks page, submit | Task appears in list |
| Deprecate button | Click on accepted artifact (admin) | Status changes to deprecated |
| Deprecate hidden | View artifact as non-admin | Button not visible |
| Empty title rejected | Submit form with empty title | Validation error shown |

### Fix 4: ID Footers

| Test | Method | Expected |
|------|--------|----------|
| Footer on create_thread | Call `cortex_create_thread` | Response ends with `Active thread: ...` |
| Footer on observe | Call `cortex_observe` | Footer present with same thread ID |
| Footer persists | Call 5+ tools in sequence | All show same thread ID |
| No footer initially | Call `cortex_search` before any thread creation | No footer (unless env var set) |
| Env var fallback | Set `CORTEX_CHECKPOINT_THREAD_ID`, call any tool | Footer shows env var value |

### Fix 5: Artifact Supersession

| Test | Method | Expected |
|------|--------|----------|
| Create link | `POST /v1/knowledge-links` with valid IDs | 201 response |
| Self-link blocked | Same source and target | Error (CHECK constraint) |
| Duplicate link blocked | Create same link twice | Error (UNIQUE constraint) |
| Get links | `GET /v1/artifacts/:id/links` | Returns links array + superseded_by |
| MCP supersedes | `cortex_draft_artifact({..., supersedes: "old-id"})` | Link created, output mentions supersession |
| Invalid supersedes | `cortex_draft_artifact({..., supersedes: "nonexistent"})` | Error before artifact creation |
| UI banner | View deprecated artifact with supersession link | Amber banner with link |
| UI no banner | View accepted artifact | No banner |
| Delete cascade | Delete artifact with links | Links automatically removed |

### Fix 6: Context Enrichment

| Test | Method | Expected |
|------|--------|----------|
| Default budget increased | `cortex_get_context()` | More content (6000 chars) |
| Topic scoping | `cortex_get_context({topic_id: "..."})` | Only topic-specific content |
| Decisions section | Topic with decision artifacts | "Recent Decisions" section appears |
| Thread status | Mix of open/resolved | Open threads shown first |
| Open threads prioritized | After data cleanup | Default view shows open threads first |

### Fix 7: Audit Logs

| Test | Method | Expected |
|------|--------|----------|
| Artifact create logged | Create artifact via API | `audit_logs` has row: action='artifact.created' |
| Thread resolve logged | Update thread status | action='thread.resolved', changes has before/after |
| Task complete logged | Mark task done | action='task.completed' |
| Fire-and-forget safe | (Simulate audit DB error) | Main operation succeeds regardless |
| Deprecate logged | Deprecate artifact | action='artifact.deprecated' with userId |

### Fix 8: Tag Normalization

| Test | Method | Expected |
|------|--------|----------|
| Tags endpoint | `GET /v1/topics/:id/tags` | Returns `{suggested, in_use, all}` |
| In-use tags accurate | Check against actual tags in DB | Matches |
| Suggested tags | Set `settings.suggested_tags` on topic | Appears in response |

### Fix 9: Activity Feed

| Test | Method | Expected |
|------|--------|----------|
| Type filter API | `GET /v1/activity?type=artifact` | Only artifact items |
| Topic filter API | `GET /v1/activity?topic_id=...` | Only that topic |
| Pagination API | `GET /v1/activity?offset=25&limit=25` | Next page of items |
| UI filter buttons | Click "Artifacts" tab | Only artifact items shown |
| UI highlights toggle | Enable checkbox | Only artifacts + decision comments |
| Load more button | Click "Load More" | Additional items appear |
| Visual differentiation | View mixed feed | Artifacts larger, checkpoints muted |
| Backward compatible | `useRecentActivity(10)` (old API) | Still works |

---

## 9. Risk Assessment

### High Risk

| Risk | Fixes | Mitigation |
|------|-------|------------|
| Migration failure | 5 | Additive only (new table). Rollback: `DROP TABLE knowledge_links; DROP TYPE knowledge_link_type;` |
| Data cleanup too aggressive | 1 | Run SELECT previews first. Back up database. Criteria excludes artifact discussion threads. |
| Activity query performance | 9 | Dynamic UNION ALL reduces scan to needed tables. Monitor query time. Add index on `comments(thread_id, created_at)` if needed. |

### Medium Risk

| Risk | Fixes | Mitigation |
|------|-------|------------|
| 16 MCP tools (increased from 15) | 2, 4 | All registered in index.ts. `isValidToolName` uses `Object.values(TOOL_NAMES)` — automatic. |
| State module isolation | 4 | Module-level variable persists for stdio process lifetime. Env var fallback covers process restart. |
| Audit log volume | 7 | Fire-and-forget. No cascade on failure. Add periodic cleanup if volume grows. |
| Breaking hook signature | 9 | `useRecentActivity` accepts both `number` and `object` for backward compatibility. |

### Low Risk

| Risk | Fixes | Mitigation |
|------|-------|------------|
| Frontend form validation | 3 | Client-side required fields + server-side Zod validation. |
| FK cascades on knowledge_links | 5 | ON DELETE CASCADE. Links auto-cleaned when artifacts deleted. Correct behavior. |
| Tag endpoint performance | 8 | 4-table UNION ALL with unnest. Fine for hundreds of rows. Add GIN indexes on `tags` columns if system scales to thousands. |

### Rollback Strategies

| Fix | Rollback |
|-----|----------|
| 1 (data cleanup) | Restore from pre-cleanup database backup |
| 2 (update-thread) | Remove tool file + index registration. UI buttons are additive (no removal needed). |
| 4 (ID footers) | Remove `state.ts`, revert footer lines in tools |
| 5 (knowledge_links) | `DROP TABLE knowledge_links; DROP TYPE knowledge_link_type;` Remove repo, routes, shared types. |
| 7 (audit logs) | Remove repository, revert service changes. `TRUNCATE audit_logs;` |
| 9 (activity filtering) | Revert `activity.repository.ts` to original UNION ALL. Old API signature still works. |

---

## 10. File Change Manifest

### New Files (8)

| # | File | Fix | Purpose |
|---|------|-----|---------|
| 1 | `packages/api/src/db/migrations/002_knowledge_links.sql` | 5 | knowledge_links table + indexes |
| 2 | `packages/api/src/db/scripts/cleanup-2026-02.sql` | 1 | One-time data cleanup |
| 3 | `packages/api/src/repositories/audit-log.repository.ts` | 7 | Audit log CRUD |
| 4 | `packages/api/src/repositories/knowledge-link.repository.ts` | 5 | Knowledge link CRUD |
| 5 | `packages/api/src/routes/knowledge-links.ts` | 5 | POST/GET/DELETE /knowledge-links |
| 6 | `packages/shared/src/types/knowledge-link.ts` | 5 | TypeScript interfaces |
| 7 | `packages/mcp/src/tools/update-thread.ts` | 2 | cortex_update_thread MCP tool |
| 8 | `packages/mcp/src/tools/state.ts` | 4 | Active thread tracking |

### Modified Files (26 unique)

| # | File | Fixes | Summary |
|---|------|-------|---------|
| 1 | `packages/api/src/db/index.ts` | 5 | Migration 002 runner |
| 2 | `packages/api/src/index.ts` | 5 | Register knowledge-links routes |
| 3 | `packages/api/src/routes/artifacts.ts` | 5 | GET /:id/links, pass userId to deprecate |
| 4 | `packages/api/src/routes/activity.ts` | 9 | type, topic_id, offset params |
| 5 | `packages/api/src/routes/topics.ts` | 8 | GET /:id/tags |
| 6 | `packages/api/src/repositories/activity.repository.ts` | 9 | Dynamic UNION ALL with filtering |
| 7 | `packages/api/src/repositories/topic.repository.ts` | 8 | getTagsInUse(), settings in SELECT |
| 8 | `packages/api/src/services/activity.service.ts` | 9 | Pass filter options |
| 9 | `packages/api/src/services/artifact.service.ts` | 7 | Audit logging, deprecate(id, userId) |
| 10 | `packages/api/src/services/thread.service.ts` | 7 | Audit logging on status change |
| 11 | `packages/api/src/services/task.service.ts` | 7 | Audit logging on status change |
| 12 | `packages/api/src/services/topic.service.ts` | 8 | getTagsInUse() delegation |
| 13 | `packages/shared/src/types/index.ts` | 5 | Export knowledge-link types |
| 14 | `packages/shared/src/types/audit-log.ts` | 7 | Extended AuditAction union |
| 15 | `packages/shared/src/validation.ts` | 5 | createKnowledgeLinkSchema |
| 16 | `packages/mcp/src/client.ts` | 2, 5 | updateThread, createKnowledgeLink, getArtifactLinks |
| 17 | `packages/mcp/src/tools/index.ts` | 2 | Register update-thread (6 changes) |
| 18 | `packages/mcp/src/tools/get-context.ts` | 4, 6 | topic_id param, budget 6000, open-first, footer |
| 19 | `packages/mcp/src/tools/create-thread.ts` | 4 | setActiveThreadId + footer |
| 20 | `packages/mcp/src/tools/draft-artifact.ts` | 4, 5 | supersedes param + footer |
| 21 | `packages/mcp/src/tools/[13 other tools]` | 4 | Import state + appendActiveThreadFooter |
| 22 | `packages/web/src/pages/Thread.tsx` | 2 | Resolve/Archive/Reopen buttons |
| 23 | `packages/web/src/pages/Topic.tsx` | 3 | New Thread + New Artifact forms |
| 24 | `packages/web/src/pages/Tasks.tsx` | 3 | New Task form + task editing |
| 25 | `packages/web/src/pages/Artifact.tsx` | 3, 5 | Deprecate button + supersession banner |
| 26 | `packages/web/src/pages/Topics.tsx` | 9 | Filters, load more, highlights, visual diff |
| 27 | `packages/web/src/api/hooks/useArtifacts.ts` | 3, 5 | useDeprecateArtifact, useArtifactLinks |
| 28 | `packages/web/src/api/hooks/useActivity.ts` | 9 | Filter options, backward compatible |
| 29 | `CLAUDE.md` | 2, 5 | Thread lifecycle + supersession docs |

### Totals

- **8 new files** + **29 modified files** (expanding `[13 other tools]`) = **37 total file changes**
- **1 SQL migration** (new table, additive)
- **1 cleanup script** (one-time execution)
- **1 new MCP tool** (`cortex_update_thread`)
- **1 new API route module** (`knowledge-links`)
- **3 new API endpoints** (POST/GET /knowledge-links, GET /artifacts/:id/links, GET /topics/:id/tags)
- **1 modified API endpoint** (GET /activity gains type, topic_id, offset)
- **4 service files modified** (audit logging)
- **15 MCP tool files modified** (ID footer)
- **5 frontend pages modified**
- **2 frontend hook files modified**

---

## Appendix A: Critical Review Corrections

The following corrections were identified during the critical review pass and are already applied in the plan above.

| # | Severity | Issue | Correction |
|---|----------|-------|------------|
| 1 | Medium | `link_type` is too generic a PostgreSQL enum name | Renamed to `knowledge_link_type` |
| 2 | Critical | `useRecentActivity` return type change would crash Topics.tsx | Maintained array return type; hook accepts both `number` and `object` for backward compatibility |
| 3 | High | 7-day thread resolution window matches zero threads (data is 2-3 days old) | Changed to content-based criteria: resolve threads with comments, no open tasks, excluding discussion threads |
| 4 | High | No automated tests for 37 file changes | Acknowledged; manual testing matrix provided. Automated integration tests deferred to Phase 1 of roadmap (test infrastructure does not exist yet). |
| 5 | High | Activity repository rewrite was handwaved | Provided complete dynamic SQL with proper topic filtering for tasks (COALESCE handling) |
| 6 | Medium | MCP tool index registration incomplete (missing export/schema/switch) | Explicitly listed all 6 changes needed in index.ts |
| 7 | Medium | `supersedes` parameter should validate artifact exists before creating | Added pre-validation: `client.getArtifact(input.supersedes)` before `client.createArtifact()` |
| 8 | Medium | `get_context` default should prioritize open threads after Fixes 1+2 | Changed default to show open threads first, resolved threads after |
| 9 | Low | Adjacent `---` separators from ID footer on tools that already end with `---` | Accepted as-is; markdown renders correctly. Standardized via `appendActiveThreadFooter` helper. |
| 10 | Low | Audit logging fire-and-forget could hold pool connections | Documented in design note. Risk is minimal for the current scale. |
| 11 | Low | File manifest count was inconsistent | Corrected: 8 new + 29 modified (with tool expansion) = 37 total |
| 12 | Verified | `topics.settings` column was claimed missing | Verified it EXISTS in schema (line 38 of 001 migration). Repository doesn't SELECT it — fixed in C3. |
| 13 | Verified | `deprecate()` service method signature | Confirmed it takes only `(id: string)` — plan correctly adds `userId` parameter in C5. |
