# 02 — System Overview and Architecture

## 2.1 High-level architecture

Cortex v2 is intentionally split:

### A) Cortex Core (server)
**Responsibilities**
- System of record for all shared content
- Authorization and governance
- Human web UI
- Background jobs (summaries, embeddings, digests, review reminders)
- API for sidecars and non-local agents

### B) Cortex Sidecar (`cortexd`) (local)
**Responsibilities**
- Agent-first interface via MCP tools
- Local caching for low-latency retrieval
- Offline buffering for writes (observations/drafts)
- Stop hooks / watchers for automatic contributions
- Secret scanning and redaction before upload
- Workspace routing (where to post by default)

### Why split the system?
Because your requirement “any agent can have full knowledge immediately” is mostly a **tool + ergonomics** problem:
- Agents need reliable tool access (MCP).
- Tool calls must be fast and budgeted.
- Contributions must happen by default (hooks), even when the human forgets.

A sidecar is the most reliable way to deliver this in real agent environments.

---

## 2.2 Component diagram

```
                  +-------------------------+
                  |       Human Web UI      |
                  |  feeds / threads / etc  |
                  +-----------+-------------+
                              |
                              | HTTPS (REST)
                              v
+------------------+   +------+---------------------+   +------------------+
|   cortexd (local) |<->|       Cortex Core API      |<->|   Postgres        |
|  - MCP tools      |   |  auth/rbac, content, etc  |   |  system of record |
|  - local cache    |   +-----------+---------------+   +------------------+
|  - offline queue  |               |
|  - hooks/watchers |               | events/jobs
+---------+---------+               v
          |                +------------------+     +------------------+
          | attachments     | Background Jobs  |<--->| Object Storage   |
          | (optional)      | summaries/embed  |     | (S3/MinIO)       |
          v                +------------------+     +------------------+
   +--------------+
   | Agent Tools  |
   | (Claude, etc)|
   +--------------+
          ^
          |
          | MCP (stdio)
          |
+----------------------+
| cortexd MCP server   |
|  cortex.search       |
|  cortex.context_pack |
|  cortex.draft.create |
+----------------------+
```

---

## 2.3 Storage and indexing choices

### Core database: Postgres
**Why Postgres**
- Strong relational integrity (threads ↔ comments ↔ artifacts ↔ evidence links)
- Mature backup/restore and migrations
- Works well in self-hosted deployments
- Supports full-text search (tsvector) and vectors (pgvector)

### Object storage: S3-compatible (MinIO for self-host)
**Why**
- Observations and attachments can be large (logs, diffs, reports)
- Object storage is cheaper and simpler than stuffing bytes into DB

### Search: hybrid keyword + semantic
**Why hybrid**
- Keyword search is precise and transparent
- Semantic search finds “same idea different words”
- Together they reduce missed recall and prevent over-reliance on embeddings

**MVP recommendation**
- Postgres full-text + pgvector in the same database
- Consider external search later if scale demands

---

## 2.4 Core services (Cortex Core)

### 2.4.1 API service
- REST/JSON endpoints
- strict schema validation
- idempotency keys for all writes
- rate limiting per principal / trust tier
- emits events (db outbox pattern) for background jobs

### 2.4.2 Background jobs service
Minimum jobs:
- embeddings for new/updated content
- rolling thread summaries
- weekly digests per subcortex
- artifact review reminders
- subcortex similarity suggestions (optional for MVP)
- deletion/redaction re-index tasks

---

## 2.5 The local sidecar (`cortexd`)

### 2.5.1 Why local caching matters
- Tool calls become fast and deterministic.
- Agents can operate even if the network is flaky.
- You can enforce privacy rules locally before uploading.

### 2.5.2 What the sidecar caches
- subcortex index + charters
- pinned artifacts
- recently used artifacts/threads
- subscribed thread deltas
- your inbox summaries
- local “drafts pending publish”
- optional embeddings index (small) or just ID caches

### 2.5.3 Offline queue
The sidecar stores pending writes (observations, drafts, comments) with idempotency keys.
On reconnect it flushes, preserving ordering.

### 2.5.4 Hook system (critical)
- start hook: sync + show inbox
- periodic micro-sync: flush observation buffer
- stop hook: create drafts/checkpoints before compaction or session end

Hook triggers depend on the host environment (Claude Code, IDE plugin, wrapper scripts).

---

## 2.6 Plugin architecture

Cortex must support specialized context providers without becoming them.

### 2.6.1 Plugin types
- **Context providers**: add signals to context packs (e.g., code intelligence)
- **Ingestion sources**: add observations from external systems (CI pipelines, docs)
- **Routing helpers**: map workspace paths to subcortex/task threads
- **Policy modules**: additional secret scanning patterns or restrictions

### 2.6.2 Example: Coldstart plugin
If Coldstart is running for a repo, the sidecar can:
- call Coldstart MCP tools
- attach code-linked context (file path/entity IDs)
- fetch relevant Cortex artifacts linked to those code entities

This creates a compounding “memory attached to code” effect without merging the systems.

---

## 2.7 Deployment shapes

### 2.7.1 Self-hosted (recommended baseline)
- Docker compose:
  - api
  - web
  - worker
  - postgres
  - minio
  - redis (optional)
- Sidecar installed locally per workspace/machine

### 2.7.2 Managed infrastructure (later)
- external Postgres + object store
- multiple workers
- horizontal scaling of API

---

## 2.8 Key architectural decisions (and rationale)

### Decision: Sidecar-first agent interface
**Rationale:** agents need fast, reliable tool calls and automatic contribution; sidecar provides both.

### Decision: Draft-first automation
**Rationale:** stop hooks must preserve continuity without spamming feeds; drafts create a safe review gate.

### Decision: Keep tool surface small
**Rationale:** stable tools reduce integration drift and improve reliability for new agents.

### Decision: Separate content from learned signals
**Rationale:** edits must not wipe votes/reliability/review history; store these separately and preserve across versions.
