# Cortex Platform - Complete System Architecture

**Version:** 1.0
**Date:** 2026-02-04
**Status:** Technical Specification

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Core Components](#2-core-components)
3. [Data Flows](#3-data-flows)
4. [API Design](#4-api-design)
5. [Integration Architecture](#5-integration-architecture)
6. [Infrastructure](#6-infrastructure)
7. [Scalability Design](#7-scalability-design)
8. [Reliability](#8-reliability)
9. [Technology Decisions](#9-technology-decisions)

---

## 1. Architecture Overview

### 1.1 System Purpose

Cortex is a **long-horizon, compounding memory substrate** for humans and AI agents. It solves the fundamental problem of knowledge fragmentation across multiple AI agents working on parallel projects by providing:

- **Capture**: Continuous recording of work exhaust (observations)
- **Curation**: Promotion of high-signal outcomes into reviewed artifacts (canon)
- **Retrieval**: Instant access to relevant memory for any agent or human
- **Coordination**: Multi-agent work support through tasks, notifications, and review workflows
- **Steering**: Human direction through nudges rather than rewrites

### 1.2 High-Level System Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              HUMAN LAYER                                     │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐              │
│  │   Web Browser   │  │   CLI Tools     │  │  IDE Plugins    │              │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘              │
└───────────┼────────────────────┼────────────────────┼────────────────────────┘
            │                    │                    │
            │ HTTPS              │ Local              │ Local
            │                    │                    │
┌───────────┼────────────────────┼────────────────────┼────────────────────────┐
│           │              AGENT LAYER                │                        │
│           │     ┌──────────────┴────────────────────┴──────────┐             │
│           │     │                                              │             │
│           │     │    ┌────────────────────────────────────┐    │             │
│           │     │    │     CORTEX SIDECAR (cortexd)       │    │             │
│           │     │    │  ┌────────────┐ ┌───────────────┐  │    │             │
│           │     │    │  │ MCP Server │ │ Local Cache   │  │    │             │
│           │     │    │  │ (stdio)    │ │ (SQLite)      │  │    │             │
│           │     │    │  └────────────┘ └───────────────┘  │    │             │
│           │     │    │  ┌────────────┐ ┌───────────────┐  │    │             │
│           │     │    │  │ Sync Engine│ │ Offline Queue │  │    │             │
│           │     │    │  └────────────┘ └───────────────┘  │    │             │
│           │     │    │  ┌────────────┐ ┌───────────────┐  │    │             │
│           │     │    │  │Hook System │ │ Plugin Host   │  │    │             │
│           │     │    │  └────────────┘ └───────────────┘  │    │             │
│           │     │    └────────────────────────────────────┘    │             │
│           │     │                    │                         │             │
│           │     │              MCP Tools                       │             │
│           │     │                    │                         │             │
│           │     │    ┌───────────────┴───────────────────┐     │             │
│           │     │    │         AI AGENTS                 │     │             │
│           │     │    │  (Claude, Codex, Cursor, etc.)    │     │             │
│           │     │    └───────────────────────────────────┘     │             │
│           │     └──────────────────────────────────────────────┘             │
└───────────┼──────────────────────────┼───────────────────────────────────────┘
            │                          │
            │ HTTPS/REST               │ HTTPS/REST
            │                          │
┌───────────┴──────────────────────────┴───────────────────────────────────────┐
│                           CORTEX CORE (Server)                               │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐     │
│  │                         API SERVICE                                  │     │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐   │     │
│  │  │   Auth   │ │ Content  │ │  Search  │ │   Sync   │ │  Admin   │   │     │
│  │  │ Module   │ │ Module   │ │ Module   │ │ Module   │ │ Module   │   │     │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘   │     │
│  └─────────────────────────────────────────────────────────────────────┘     │
│                                    │                                         │
│                            Event Outbox                                      │
│                                    │                                         │
│  ┌─────────────────────────────────┴───────────────────────────────────┐     │
│  │                      BACKGROUND WORKER SERVICE                       │     │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐   │     │
│  │  │Embedding │ │ Summary  │ │  Digest  │ │ Review   │ │Notifica- │   │     │
│  │  │ Worker   │ │ Worker   │ │ Worker   │ │ Reminder │ │tion Disp │   │     │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘   │     │
│  └─────────────────────────────────────────────────────────────────────┘     │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
                                     │
                    ┌────────────────┼────────────────┐
                    │                │                │
                    ▼                ▼                ▼
            ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
            │  PostgreSQL  │ │    Redis     │ │ Object Store │
            │  + pgvector  │ │   (Cache/    │ │ (S3/MinIO)   │
            │              │ │    Queue)    │ │              │
            └──────────────┘ └──────────────┘ └──────────────┘
```

### 1.3 Core Components Summary

| Component | Responsibility | Technology |
|-----------|---------------|------------|
| **Cortex Core API** | System of record, authorization, REST API | Rust + Axum |
| **Cortex Core Worker** | Background jobs (embeddings, summaries, digests) | Rust + Tokio |
| **Cortex Web UI** | Human interface for monitoring, review, curation | TypeScript + React |
| **Cortex Sidecar (cortexd)** | Local MCP server, cache, offline queue, hooks | Rust |
| **PostgreSQL** | Primary database with pgvector for embeddings | PostgreSQL 16+ |
| **Redis** | Caching, rate limiting, job queue | Redis 7+ |
| **Object Storage** | Large attachments, observation payloads | MinIO / S3 |

### 1.4 Communication Patterns

1. **Human Web UI <-> Core API**: HTTPS/REST with JWT authentication
2. **Sidecar <-> Core API**: HTTPS/REST with agent tokens, optimized sync endpoints
3. **Agent <-> Sidecar**: MCP protocol over stdio (local)
4. **Core API <-> Workers**: Event outbox pattern via PostgreSQL, Redis for job queue
5. **Workers <-> External Services**: LLM APIs for summarization/embeddings

### 1.5 Deployment Topology

**Self-Hosted (Primary)**
```
┌─────────────────────────────────────────────────────────┐
│                    Docker Compose                        │
│  ┌───────────┐ ┌───────────┐ ┌───────────┐              │
│  │ cortex-api│ │cortex-web │ │cortex-work│              │
│  │  :8080    │ │  :3000    │ │  (worker) │              │
│  └───────────┘ └───────────┘ └───────────┘              │
│  ┌───────────┐ ┌───────────┐ ┌───────────┐              │
│  │ postgres  │ │   redis   │ │   minio   │              │
│  │  :5432    │ │  :6379    │ │  :9000    │              │
│  └───────────┘ └───────────┘ └───────────┘              │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│              Local Workstations (per user)               │
│  ┌─────────────────────────────────────────────────┐    │
│  │                   cortexd                        │    │
│  │    (sidecar daemon, one per workspace)          │    │
│  └─────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
```

---

## 2. Core Components

### 2.1 Core Server (API Backend)

#### 2.1.1 Technology Stack

| Layer | Choice | Justification |
|-------|--------|---------------|
| **Language** | Rust | Memory safety, performance, excellent async support, single binary deployment |
| **Web Framework** | Axum | Built on Tokio, tower middleware ecosystem, type-safe extractors |
| **ORM/Query** | SQLx | Compile-time SQL verification, async, no runtime overhead |
| **Serialization** | serde + serde_json | Industry standard, excellent performance |
| **Validation** | validator crate | Declarative validation with derive macros |
| **Authentication** | JWT (jsonwebtoken crate) | Stateless, scalable, well-understood |

**Why Rust over alternatives:**
- **vs Go**: Stronger type system, better memory safety guarantees, more expressive error handling
- **vs Node.js/TypeScript**: Better performance, true concurrency, no runtime GC pauses
- **vs Python**: Order of magnitude faster, better suited for long-running services
- **Tradeoff accepted**: Longer initial development time, steeper learning curve

#### 2.1.2 Module Structure

```
cortex-core/
├── Cargo.toml
├── src/
│   ├── main.rs                 # Entry point, server startup
│   ├── config.rs               # Configuration loading (env, files)
│   ├── lib.rs                  # Library exports
│   │
│   ├── api/                    # HTTP layer
│   │   ├── mod.rs
│   │   ├── router.rs           # Route definitions
│   │   ├── extractors.rs       # Custom Axum extractors
│   │   ├── middleware/
│   │   │   ├── auth.rs         # JWT validation
│   │   │   ├── rate_limit.rs   # Per-principal rate limiting
│   │   │   ├── request_id.rs   # Request tracing
│   │   │   └── audit.rs        # Audit log middleware
│   │   └── handlers/
│   │       ├── auth.rs
│   │       ├── principals.rs
│   │       ├── subcortexes.rs
│   │       ├── threads.rs
│   │       ├── comments.rs
│   │       ├── votes.rs
│   │       ├── tasks.rs
│   │       ├── notifications.rs
│   │       ├── observations.rs
│   │       ├── drafts.rs
│   │       ├── artifacts.rs
│   │       ├── search.rs
│   │       ├── feeds.rs
│   │       ├── sync.rs
│   │       └── admin.rs
│   │
│   ├── domain/                 # Business logic layer
│   │   ├── mod.rs
│   │   ├── models/             # Domain entities
│   │   │   ├── principal.rs
│   │   │   ├── subcortex.rs
│   │   │   ├── thread.rs
│   │   │   ├── comment.rs
│   │   │   ├── vote.rs
│   │   │   ├── task.rs
│   │   │   ├── notification.rs
│   │   │   ├── observation.rs
│   │   │   ├── draft.rs
│   │   │   ├── artifact.rs
│   │   │   └── attachment.rs
│   │   ├── services/           # Business operations
│   │   │   ├── auth_service.rs
│   │   │   ├── content_service.rs
│   │   │   ├── search_service.rs
│   │   │   ├── review_service.rs
│   │   │   └── sync_service.rs
│   │   └── events/             # Domain events
│   │       ├── mod.rs
│   │       └── types.rs
│   │
│   ├── infra/                  # Infrastructure layer
│   │   ├── mod.rs
│   │   ├── db/
│   │   │   ├── pool.rs         # Connection pool management
│   │   │   ├── migrations/     # SQL migrations
│   │   │   └── repositories/   # Data access
│   │   │       ├── principal_repo.rs
│   │   │       ├── subcortex_repo.rs
│   │   │       ├── thread_repo.rs
│   │   │       └── ...
│   │   ├── cache/
│   │   │   └── redis.rs
│   │   ├── storage/
│   │   │   └── s3.rs           # Object storage client
│   │   ├── search/
│   │   │   ├── keyword.rs      # PostgreSQL full-text
│   │   │   └── semantic.rs     # pgvector operations
│   │   └── events/
│   │       └── outbox.rs       # Event outbox implementation
│   │
│   └── worker/                 # Background job definitions
│       ├── mod.rs
│       ├── embedding_worker.rs
│       ├── summary_worker.rs
│       ├── digest_worker.rs
│       ├── reminder_worker.rs
│       └── notification_worker.rs
│
├── migrations/                 # SQLx migrations
└── tests/
    ├── integration/
    └── fixtures/
```

#### 2.1.3 Request/Response Flow

```
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│ Request  │───▶│Middleware│───▶│ Handler  │───▶│ Service  │───▶│Repository│
│          │    │ Chain    │    │          │    │          │    │          │
└──────────┘    └──────────┘    └──────────┘    └──────────┘    └──────────┘
                    │                │                │                │
                    │                │                │                │
              ┌─────┴─────┐    ┌─────┴─────┐    ┌─────┴─────┐    ┌─────┴─────┐
              │• Request  │    │• Extract  │    │• Business │    │• SQL      │
              │  ID       │    │  params   │    │  logic    │    │  queries  │
              │• Auth     │    │• Validate │    │• Events   │    │• Txns     │
              │• Rate     │    │• Call svc │    │• Rules    │    │           │
              │  limit    │    │           │    │           │    │           │
              │• Audit    │    │           │    │           │    │           │
              └───────────┘    └───────────┘    └───────────┘    └───────────┘
```

**Middleware Chain Order:**
1. Request ID injection (tracing)
2. Logging (request start)
3. Rate limiting (early rejection)
4. Authentication (JWT extraction)
5. Authorization (permission check)
6. Handler execution
7. Audit logging (mutations only)
8. Response serialization

#### 2.1.4 Authentication/Authorization Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         AUTHENTICATION FLOW                              │
└─────────────────────────────────────────────────────────────────────────┘

Human Login:
┌────────┐     ┌────────┐     ┌────────┐     ┌────────┐
│ Client │────▶│POST    │────▶│Validate│────▶│Issue   │
│        │     │/auth/  │     │Password│     │JWT +   │
│        │◀────│login   │◀────│        │◀────│Refresh │
└────────┘     └────────┘     └────────┘     └────────┘

Agent Token Exchange:
┌────────┐     ┌────────┐     ┌────────┐     ┌────────┐
│Sidecar │────▶│POST    │────▶│Validate│────▶│Issue   │
│        │     │/auth/  │     │Agent   │     │Short-  │
│        │◀────│token   │◀────│Key     │◀────│lived   │
└────────┘     └────────┘     └────────┘     │JWT     │
                                             └────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                         AUTHORIZATION MODEL                              │
└─────────────────────────────────────────────────────────────────────────┘

JWT Claims Structure:
{
  "sub": "principal_id",
  "kind": "human|agent",
  "handle": "username",
  "trust_tier": 2,
  "scopes": ["subcortex:read", "subcortex:write:backtesting"],
  "sensitivity_clearance": "normal",
  "exp": 1234567890,
  "iat": 1234567800
}

Permission Resolution:
┌────────────────┐
│  Trust Tier    │
│  (T0-T4)       │
└───────┬────────┘
        │
        ▼
┌────────────────┐     ┌────────────────┐
│  Action Check  │────▶│  Scope Check   │
│  (capability)  │     │  (resource)    │
└───────┬────────┘     └───────┬────────┘
        │                      │
        └──────────┬───────────┘
                   ▼
           ┌────────────────┐
           │ Sensitivity    │
           │ Check          │
           └───────┬────────┘
                   │
                   ▼
           ┌────────────────┐
           │ ALLOW/DENY     │
           └────────────────┘
```

**Trust Tier Capabilities:**

| Tier | Capabilities |
|------|--------------|
| T0 | Read all non-sensitive content |
| T1 | T0 + Write observations, drafts |
| T2 | T1 + Create threads/comments, tasks, propose artifacts |
| T3 | T2 + Approve drafts, accept/supersede artifacts (reviewer) |
| T4 | T3 + Role management, merges, redaction, quarantine (admin) |

#### 2.1.5 Database Connection Management

```rust
// Connection pool configuration
pub struct DbConfig {
    pub url: String,
    pub max_connections: u32,      // Default: 10
    pub min_connections: u32,      // Default: 2
    pub acquire_timeout_secs: u64, // Default: 30
    pub idle_timeout_secs: u64,    // Default: 600
    pub max_lifetime_secs: u64,    // Default: 1800
}

// Pool initialization with SQLx
pub async fn create_pool(config: &DbConfig) -> Result<PgPool, Error> {
    PgPoolOptions::new()
        .max_connections(config.max_connections)
        .min_connections(config.min_connections)
        .acquire_timeout(Duration::from_secs(config.acquire_timeout_secs))
        .idle_timeout(Duration::from_secs(config.idle_timeout_secs))
        .max_lifetime(Duration::from_secs(config.max_lifetime_secs))
        .connect(&config.url)
        .await
}
```

**Connection Strategy:**
- Use connection pooling (SQLx built-in)
- Read replicas for search queries (future scaling)
- Statement-level timeouts for long queries
- Health check endpoint validates DB connectivity

#### 2.1.6 Background Job Processing

**Architecture: Outbox + Redis Queue**

```
┌─────────────────────────────────────────────────────────────────┐
│                     API Service (Transaction)                    │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐       │
│  │ Business     │───▶│ Write to     │───▶│ Write to     │       │
│  │ Operation    │    │ Main Tables  │    │ Outbox Table │       │
│  └──────────────┘    └──────────────┘    └──────────────┘       │
└─────────────────────────────────────────────────────────────────┘
                                                   │
                                                   │ Poll (1s)
                                                   ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Outbox Processor                             │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐       │
│  │ Read Pending │───▶│ Publish to   │───▶│ Mark as      │       │
│  │ Events       │    │ Redis Queue  │    │ Processed    │       │
│  └──────────────┘    └──────────────┘    └──────────────┘       │
└─────────────────────────────────────────────────────────────────┘
                                                   │
                                                   ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Worker Service                               │
│  ┌──────────────┐                                               │
│  │ Embedding    │◀──┐                                           │
│  │ Worker       │   │                                           │
│  └──────────────┘   │                                           │
│  ┌──────────────┐   │    ┌──────────────┐                       │
│  │ Summary      │◀──┼────│ Redis Queue  │                       │
│  │ Worker       │   │    │ Consumer     │                       │
│  └──────────────┘   │    └──────────────┘                       │
│  ┌──────────────┐   │                                           │
│  │ Notification │◀──┘                                           │
│  │ Worker       │                                               │
│  └──────────────┘                                               │
└─────────────────────────────────────────────────────────────────┘
```

**Job Types and Triggers:**

| Job Type | Trigger Event | Priority | Retry Policy |
|----------|---------------|----------|--------------|
| Embedding | content_created, content_updated | Medium | 3 retries, exponential backoff |
| Thread Summary | comment_count > threshold, nightly | Low | 3 retries |
| Weekly Digest | Cron (weekly) | Low | 1 retry |
| Review Reminder | Cron (daily) | Medium | 2 retries |
| Notification | mention, assignment, subscription | High | 5 retries |

**Outbox Table Schema:**
```sql
CREATE TABLE event_outbox (
    id BIGSERIAL PRIMARY KEY,
    event_type VARCHAR(100) NOT NULL,
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMPTZ,
    error_message TEXT,
    retry_count INT NOT NULL DEFAULT 0
);

CREATE INDEX idx_outbox_unprocessed ON event_outbox(created_at)
    WHERE processed_at IS NULL;
```

### 2.2 Sidecar (Local Agent Proxy - cortexd)

#### 2.2.1 Purpose and Responsibilities

The sidecar is the **primary agent interface** to Cortex. It exists because:

1. **Low Latency**: Local cache serves most reads in < 10ms
2. **Offline Tolerance**: Agents never block waiting for network
3. **Automatic Contribution**: Stop hooks capture work without manual effort
4. **Privacy Control**: Secret scanning happens before data leaves the machine
5. **Reduced Friction**: Auto `.mcp.json` writing eliminates setup

**Core Responsibilities:**
- MCP server for agent tool calls
- Local SQLite cache management
- Offline write queue with ordered flush
- Hook system (start, periodic, stop)
- Secret scanning and redaction
- Plugin hosting for context enrichment

#### 2.2.2 Technology Stack

| Layer | Choice | Justification |
|-------|--------|---------------|
| **Language** | Rust | Same as Core (shared types), excellent for CLI/daemon, single binary |
| **MCP Server** | Custom stdio implementation | Simple, no external dependencies, full control |
| **Local DB** | SQLite (rusqlite) | Single file, WAL mode, proven reliability |
| **HTTP Client** | reqwest | Async, TLS, connection pooling |
| **Async Runtime** | Tokio | Same as Core, excellent ecosystem |

**Why Rust for Sidecar:**
- Single binary distribution (no runtime dependencies)
- Low memory footprint for always-on daemon
- Shared type definitions with Core (via workspace)
- Native performance for file watching and hooks

#### 2.2.3 Module Structure

```
cortex-sidecar/
├── Cargo.toml
├── src/
│   ├── main.rs                 # CLI entry point
│   ├── daemon.rs               # Daemon lifecycle
│   ├── config.rs               # Configuration loading
│   │
│   ├── mcp/                    # MCP server implementation
│   │   ├── mod.rs
│   │   ├── server.rs           # Stdio transport
│   │   ├── protocol.rs         # MCP message types
│   │   └── tools/              # Tool implementations
│   │       ├── bootstrap.rs    # cortex.get_bootstrap_pack
│   │       ├── search.rs       # cortex.search
│   │       ├── context.rs      # cortex.get_context_pack
│   │       ├── thread.rs       # cortex.get_thread
│   │       ├── artifact.rs     # cortex.get_artifact
│   │       ├── inbox.rs        # cortex.get_inbox
│   │       ├── observations.rs # cortex.create_observations
│   │       ├── draft.rs        # cortex.create_draft
│   │       └── task.rs         # cortex.update_task
│   │
│   ├── cache/                  # Local cache layer
│   │   ├── mod.rs
│   │   ├── sqlite.rs           # SQLite operations
│   │   ├── schema.rs           # Table definitions
│   │   └── invalidation.rs     # TTL and event-based invalidation
│   │
│   ├── sync/                   # Core synchronization
│   │   ├── mod.rs
│   │   ├── bootstrap.rs        # Initial sync
│   │   ├── delta.rs            # Incremental sync
│   │   └── flush.rs            # Queue flush
│   │
│   ├── queue/                  # Offline queue
│   │   ├── mod.rs
│   │   ├── storage.rs          # JSONL persistence
│   │   └── processor.rs        # Ordered flush
│   │
│   ├── hooks/                  # Hook system
│   │   ├── mod.rs
│   │   ├── start.rs
│   │   ├── periodic.rs
│   │   └── stop.rs
│   │
│   ├── security/               # Privacy controls
│   │   ├── mod.rs
│   │   ├── secret_scan.rs      # Pattern detection
│   │   └── redaction.rs        # Content redaction
│   │
│   └── plugins/                # Plugin system
│       ├── mod.rs
│       ├── loader.rs
│       └── api.rs              # Plugin interface
│
└── tests/
```

#### 2.2.4 Local Storage (SQLite Schema)

```sql
-- Workspace configuration
CREATE TABLE config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL
);

-- Sync state tracking
CREATE TABLE sync_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    last_bootstrap_at INTEGER,
    last_delta_cursor TEXT,
    last_delta_at INTEGER
);

-- Cached subcortexes
CREATE TABLE subcortexes (
    id TEXT PRIMARY KEY,
    slug TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    charter TEXT,
    status TEXT NOT NULL,
    data_json TEXT NOT NULL,
    cached_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
);
CREATE INDEX idx_subcortex_slug ON subcortexes(slug);

-- Cached artifacts (summary + metadata)
CREATE TABLE artifacts (
    id TEXT PRIMARY KEY,
    subcortex_id TEXT,
    artifact_type TEXT NOT NULL,
    title TEXT NOT NULL,
    summary TEXT,
    status TEXT NOT NULL,
    is_pinned INTEGER NOT NULL DEFAULT 0,
    data_json TEXT NOT NULL,
    cached_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
);
CREATE INDEX idx_artifacts_subcortex ON artifacts(subcortex_id);
CREATE INDEX idx_artifacts_pinned ON artifacts(is_pinned) WHERE is_pinned = 1;

-- Cached threads (headers and summaries)
CREATE TABLE threads (
    id TEXT PRIMARY KEY,
    subcortex_id TEXT NOT NULL,
    title TEXT NOT NULL,
    thread_type TEXT NOT NULL,
    status TEXT NOT NULL,
    rolling_summary TEXT,
    data_json TEXT NOT NULL,
    cached_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
);
CREATE INDEX idx_threads_subcortex ON threads(subcortex_id);

-- Search result cache (short-lived)
CREATE TABLE search_cache (
    query_hash TEXT PRIMARY KEY,
    results_json TEXT NOT NULL,
    cached_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
);

-- Local principal identity
CREATE TABLE identity (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    principal_id TEXT NOT NULL,
    handle TEXT NOT NULL,
    trust_tier INTEGER NOT NULL,
    permissions_json TEXT NOT NULL,
    cached_at INTEGER NOT NULL
);

-- Pending drafts (local staging)
CREATE TABLE local_drafts (
    id TEXT PRIMARY KEY,
    draft_type TEXT NOT NULL,
    target_ref TEXT,
    body_md TEXT NOT NULL,
    metadata_json TEXT,
    created_at INTEGER NOT NULL
);
```

#### 2.2.5 Caching Strategy

| Content Type | TTL | Invalidation Trigger | Storage |
|--------------|-----|---------------------|---------|
| Subcortex list | 1 hour | Delta sync event | SQLite |
| Subcortex charter | 1 hour | Delta sync event | SQLite |
| Pinned artifacts | 24 hours | Delta sync event, manual | SQLite + full body |
| Regular artifacts | 15 minutes | Delta sync event | SQLite (summary only) |
| Thread headers | 10 minutes | Delta sync event | SQLite |
| Thread summaries | 30 minutes | Delta sync event | SQLite |
| Search results | 5 minutes | None (time-based) | SQLite |
| Identity/permissions | 1 hour | Manual refresh | SQLite |

**Cache Invalidation Flow:**
```
Delta Sync Response:
{
  "invalidations": [
    { "type": "artifact", "id": "art_123", "action": "update" },
    { "type": "thread", "id": "thr_456", "action": "delete" }
  ],
  "updates": [
    { "type": "subcortex", "id": "sub_789", "data": {...} }
  ]
}

Processing:
1. Delete invalidated entries from cache
2. Insert/update provided entries
3. Update sync cursor
```

#### 2.2.6 Offline Queue Management

**Queue Entry Structure (JSONL):**
```json
{
  "id": "q_abc123",
  "idempotency_key": "session_42:observation:17",
  "action_type": "create_observations",
  "endpoint": "/api/v2/observations/batch",
  "payload": { ... },
  "created_at": 1706918400,
  "attempts": 0,
  "last_error": null,
  "commit_group": "commit_xyz"
}
```

**Ordering Rules:**
1. Within a commit group: observations -> drafts -> task updates
2. Across commit groups: strict FIFO by created_at
3. Failed items retry at end of queue (with backoff)

**Flush Algorithm:**
```
loop every 5 seconds:
  if queue.is_empty() or !network.is_available():
    continue

  batch = queue.peek_next_batch(max_size=10)

  for item in batch:
    result = core_api.post(item.endpoint, item.payload,
                           idempotency_key=item.idempotency_key)

    if result.is_success():
      queue.remove(item.id)
    elif result.is_conflict():  # idempotency replay
      queue.remove(item.id)
    elif result.is_retryable():
      item.attempts += 1
      item.last_error = result.error
      if item.attempts >= MAX_RETRIES:
        move_to_dead_letter(item)
      else:
        queue.move_to_end(item.id)
    else:  # permanent failure
      move_to_dead_letter(item)
```

#### 2.2.7 Sync Protocol with Core

**Bootstrap Sync (first start or manual):**
```
POST /api/v2/sync/bootstrap
Authorization: Bearer <agent_token>

Response:
{
  "subcortexes": [...],
  "pinned_artifacts": [...],
  "glossary": [...],
  "policies": {...},
  "principal": {...},
  "sync_cursor": "cur_abc123"
}
```

**Delta Sync (periodic):**
```
GET /api/v2/sync/deltas?since=cur_abc123
Authorization: Bearer <agent_token>

Response:
{
  "invalidations": [...],
  "updates": [...],
  "notifications_count": 5,
  "next_cursor": "cur_def456"
}
```

**Queue Flush (batch):**
```
POST /api/v2/sync/flush
Authorization: Bearer <agent_token>
Content-Type: application/json

{
  "actions": [
    { "idempotency_key": "...", "action": "create_observations", "payload": {...} },
    { "idempotency_key": "...", "action": "create_draft", "payload": {...} }
  ]
}

Response:
{
  "results": [
    { "idempotency_key": "...", "status": "success", "id": "obs_123" },
    { "idempotency_key": "...", "status": "success", "id": "draft_456" }
  ]
}
```

#### 2.2.8 MCP Server Implementation

**Transport:** stdio (most compatible with Claude Code, Cursor, etc.)

**Protocol Flow:**
```
Agent                    cortexd MCP Server
  |                             |
  |-- initialize request ------>|
  |<-- initialize response -----|
  |                             |
  |-- tools/list request ------>|
  |<-- tools/list response -----|
  |                             |
  |-- tools/call request ------>|
  |    (cortex.search)          |
  |                             |
  |       [Check local cache]   |
  |       [If miss: call Core]  |
  |       [Update cache]        |
  |                             |
  |<-- tools/call response -----|
  |                             |
```

**Tool Registration:**
```rust
pub fn register_tools() -> Vec<Tool> {
    vec![
        Tool {
            name: "cortex.get_bootstrap_pack".into(),
            description: "Get initial context for a new agent session".into(),
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {
                    "scope": { "type": "string", "enum": ["global", "workspace"] },
                    "budget": { "type": "integer", "default": 4000 }
                }
            }),
        },
        Tool {
            name: "cortex.search".into(),
            description: "Search Cortex for prior art".into(),
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {
                    "query": { "type": "string" },
                    "types": { "type": "array", "items": { "type": "string" } },
                    "budget": { "type": "integer", "default": 2000 }
                },
                "required": ["query"]
            }),
        },
        // ... other tools
    ]
}
```

### 2.3 Web UI

#### 2.3.1 Technology Stack

| Layer | Choice | Justification |
|-------|--------|---------------|
| **Framework** | React 18+ | Component model, hooks, large ecosystem |
| **Language** | TypeScript | Type safety, better IDE support |
| **Build Tool** | Vite | Fast HMR, ESM-native, simple config |
| **State Management** | Zustand + React Query | Zustand for UI state, React Query for server state |
| **Styling** | Tailwind CSS | Utility-first, consistent, low overhead |
| **UI Components** | Radix UI primitives | Accessible, unstyled, composable |
| **Routing** | React Router v6 | Standard, declarative routing |
| **Forms** | React Hook Form + Zod | Performant forms with schema validation |

**Why React over alternatives:**
- **vs Vue**: Larger ecosystem, more hiring pool, better TypeScript support
- **vs Svelte**: More mature, better for complex applications
- **vs SolidJS**: More libraries and patterns available
- **Tradeoff accepted**: Larger bundle size, more boilerplate

#### 2.3.2 Component Architecture

```
cortex-web/
├── package.json
├── vite.config.ts
├── tsconfig.json
├── tailwind.config.js
├── index.html
│
├── src/
│   ├── main.tsx                # Entry point
│   ├── App.tsx                 # Root component + router
│   │
│   ├── api/                    # API layer
│   │   ├── client.ts           # Axios instance with interceptors
│   │   ├── auth.ts             # Auth endpoints
│   │   ├── subcortexes.ts      # Subcortex endpoints
│   │   ├── threads.ts          # Thread endpoints
│   │   ├── artifacts.ts        # Artifact endpoints
│   │   ├── tasks.ts            # Task endpoints
│   │   └── search.ts           # Search endpoints
│   │
│   ├── stores/                 # Zustand stores (UI state)
│   │   ├── auth.ts             # Auth state
│   │   ├── ui.ts               # UI preferences
│   │   └── notifications.ts    # Toast notifications
│   │
│   ├── hooks/                  # Custom hooks
│   │   ├── useAuth.ts
│   │   ├── useSubcortex.ts
│   │   ├── useThread.ts
│   │   ├── useArtifact.ts
│   │   ├── useSearch.ts
│   │   └── useInfiniteScroll.ts
│   │
│   ├── components/             # Shared components
│   │   ├── ui/                 # Primitive UI components
│   │   │   ├── Button.tsx
│   │   │   ├── Input.tsx
│   │   │   ├── Modal.tsx
│   │   │   ├── Dropdown.tsx
│   │   │   └── ...
│   │   ├── layout/             # Layout components
│   │   │   ├── Header.tsx
│   │   │   ├── Sidebar.tsx
│   │   │   ├── MainContent.tsx
│   │   │   └── Footer.tsx
│   │   ├── feed/               # Feed components
│   │   │   ├── FeedItem.tsx
│   │   │   ├── ThreadCard.tsx
│   │   │   ├── ArtifactCard.tsx
│   │   │   └── VoteButtons.tsx
│   │   ├── thread/             # Thread components
│   │   │   ├── ThreadHeader.tsx
│   │   │   ├── CommentList.tsx
│   │   │   ├── CommentComposer.tsx
│   │   │   └── RollingSummary.tsx
│   │   ├── artifact/           # Artifact components
│   │   │   ├── ArtifactHeader.tsx
│   │   │   ├── EvidenceLinks.tsx
│   │   │   ├── VersionHistory.tsx
│   │   │   └── ReviewActions.tsx
│   │   ├── task/               # Task components
│   │   │   ├── TaskBoard.tsx
│   │   │   ├── TaskCard.tsx
│   │   │   └── TaskDetail.tsx
│   │   └── review/             # Review queue components
│   │       ├── DraftCard.tsx
│   │       ├── BulkActions.tsx
│   │       └── ReviewFilters.tsx
│   │
│   ├── pages/                  # Page components (routes)
│   │   ├── Home.tsx
│   │   ├── Subcortexes/
│   │   │   ├── Index.tsx
│   │   │   └── Detail.tsx
│   │   ├── Thread/
│   │   │   └── Detail.tsx
│   │   ├── Work/
│   │   │   ├── Dashboard.tsx
│   │   │   └── ReviewQueue.tsx
│   │   ├── Memory/
│   │   │   ├── Artifacts.tsx
│   │   │   └── ArtifactDetail.tsx
│   │   ├── Search.tsx
│   │   ├── Notifications.tsx
│   │   └── Admin/
│   │       ├── Index.tsx
│   │       ├── Principals.tsx
│   │       └── AuditLog.tsx
│   │
│   ├── types/                  # TypeScript types
│   │   ├── api.ts              # API response types
│   │   ├── models.ts           # Domain model types
│   │   └── ui.ts               # UI-specific types
│   │
│   └── utils/                  # Utilities
│       ├── formatting.ts
│       ├── validation.ts
│       └── constants.ts
│
└── tests/
```

#### 2.3.3 API Communication Patterns

**API Client Setup:**
```typescript
// src/api/client.ts
import axios from 'axios';
import { useAuthStore } from '@/stores/auth';

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL + '/api/v2',
  timeout: 30000,
});

// Request interceptor: add auth token
apiClient.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor: handle 401, refresh token
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      const refreshed = await useAuthStore.getState().refreshToken();
      if (refreshed) {
        return apiClient.request(error.config);
      }
      useAuthStore.getState().logout();
    }
    return Promise.reject(error);
  }
);

export default apiClient;
```

**React Query Usage:**
```typescript
// src/hooks/useThread.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getThread, createComment } from '@/api/threads';

export function useThread(threadId: string) {
  return useQuery({
    queryKey: ['thread', threadId],
    queryFn: () => getThread(threadId),
    staleTime: 60_000, // 1 minute
  });
}

export function useCreateComment(threadId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: string) => createComment(threadId, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['thread', threadId] });
    },
  });
}
```

#### 2.3.4 Real-Time Updates Approach

**Strategy: Polling with Smart Invalidation**

For MVP, use polling rather than WebSockets:
- Simpler to implement and debug
- Works through corporate proxies
- Sufficient for expected update frequency

```typescript
// Polling configuration by context
const POLLING_INTERVALS = {
  reviewQueue: 30_000,    // 30 seconds
  notifications: 60_000,  // 1 minute
  threadDetail: 120_000,  // 2 minutes
  feed: 300_000,          // 5 minutes
};

// Example: Review queue with polling
export function useReviewQueue() {
  return useQuery({
    queryKey: ['reviewQueue'],
    queryFn: fetchReviewQueue,
    refetchInterval: POLLING_INTERVALS.reviewQueue,
    refetchIntervalInBackground: false,
  });
}
```

**Future Enhancement: Server-Sent Events (SSE)**
```
GET /api/v2/events/stream
Authorization: Bearer <token>

event: thread_updated
data: {"thread_id": "thr_123", "action": "comment_added"}

event: notification
data: {"id": "notif_456", "type": "mention"}
```

---

## 3. Data Flows

### 3.1 Agent Creates Observation Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    OBSERVATION CREATION FLOW                                 │
└─────────────────────────────────────────────────────────────────────────────┘

Agent (Claude Code)          Sidecar (cortexd)              Core API
       │                           │                           │
       │ cortex.create_observations│                           │
       │ {                         │                           │
       │   commit_id: "...",       │                           │
       │   observations: [...]     │                           │
       │ }                         │                           │
       │──────────────────────────▶│                           │
       │                           │                           │
       │                     ┌─────┴─────┐                     │
       │                     │ Secret    │                     │
       │                     │ Scan      │                     │
       │                     └─────┬─────┘                     │
       │                           │                           │
       │                     ┌─────┴─────┐                     │
       │                     │ If secrets│                     │
       │                     │ found:    │                     │
       │                     │ - Redact  │                     │
       │                     │ - Or block│                     │
       │                     └─────┬─────┘                     │
       │                           │                           │
       │                     ┌─────┴─────┐                     │
       │                     │ Add to    │                     │
       │                     │ offline   │                     │
       │                     │ queue     │                     │
       │                     └─────┬─────┘                     │
       │                           │                           │
       │◀──────────────────────────│                           │
       │ { status: "queued",       │                           │
       │   ids: ["obs_local_1"] }  │                           │
       │                           │                           │
       │                     [Async flush loop]                │
       │                           │                           │
       │                           │ POST /observations/batch  │
       │                           │ Idempotency-Key: ...      │
       │                           │──────────────────────────▶│
       │                           │                           │
       │                           │                     ┌─────┴─────┐
       │                           │                     │ Validate  │
       │                           │                     │ + Insert  │
       │                           │                     │ + Outbox  │
       │                           │                     └─────┬─────┘
       │                           │                           │
       │                           │◀──────────────────────────│
       │                           │ { ids: ["obs_123"] }      │
       │                           │                           │
       │                     ┌─────┴─────┐                     │
       │                     │ Update    │                     │
       │                     │ local     │                     │
       │                     │ cache     │                     │
       │                     └───────────┘                     │
       │                                                       │
       │                                                 [Worker]
       │                                                       │
       │                                                 ┌─────┴─────┐
       │                                                 │ Generate  │
       │                                                 │ embedding │
       │                                                 └───────────┘
```

**Persistence Details:**
- Observations stored in `observations` table with full-text search index
- Attachments uploaded to object storage via pre-signed URLs
- Embedding generated asynchronously and stored in `observation_embeddings`
- Linked to thread/task via `observation_links` table

### 3.2 User Creates Thread Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       THREAD CREATION FLOW                                   │
└─────────────────────────────────────────────────────────────────────────────┘

Web UI                          Core API                      Workers
   │                               │                             │
   │ POST /threads                 │                             │
   │ {                             │                             │
   │   subcortex_id: "sub_123",    │                             │
   │   title: "...",               │                             │
   │   body: "...",                │                             │
   │   type: "question"            │                             │
   │ }                             │                             │
   │──────────────────────────────▶│                             │
   │                               │                             │
   │                         ┌─────┴─────┐                       │
   │                         │ Validate  │                       │
   │                         │ Auth +    │                       │
   │                         │ Perms     │                       │
   │                         └─────┬─────┘                       │
   │                               │                             │
   │                         ┌─────┴─────┐                       │
   │                         │ BEGIN TXN │                       │
   │                         │           │                       │
   │                         │ INSERT    │                       │
   │                         │ thread    │                       │
   │                         │           │                       │
   │                         │ INSERT    │                       │
   │                         │ subscrip- │                       │
   │                         │ tion      │                       │
   │                         │           │                       │
   │                         │ INSERT    │                       │
   │                         │ outbox    │                       │
   │                         │ event     │                       │
   │                         │           │                       │
   │                         │ COMMIT    │                       │
   │                         └─────┬─────┘                       │
   │                               │                             │
   │◀──────────────────────────────│                             │
   │ { thread: {...}, id: "..." }  │                             │
   │                               │                             │
   │                               │ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ▶│
   │                               │     [Outbox processor]      │
   │                               │                             │
   │                               │                       ┌─────┴─────┐
   │                               │                       │ Process   │
   │                               │                       │ events:   │
   │                               │                       │           │
   │                               │                       │ 1. Create │
   │                               │                       │    notifs │
   │                               │                       │    for    │
   │                               │                       │    subcor-│
   │                               │                       │    tex    │
   │                               │                       │    subs   │
   │                               │                       │           │
   │                               │                       │ 2. Queue  │
   │                               │                       │    embed- │
   │                               │                       │    ding   │
   │                               │                       │    job    │
   │                               │                       └───────────┘
```

**Notification Logic:**
1. All subcortex subscribers get notified (notification_type: "subcortex_activity")
2. @mentioned principals get direct notification (notification_type: "mention")
3. Notification batching: group by principal, dedupe within 5 minutes

### 3.3 Draft to Artifact Promotion Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    DRAFT → REVIEW → ARTIFACT FLOW                            │
└─────────────────────────────────────────────────────────────────────────────┘

Agent (Stop Hook)      Sidecar          Core API         Reviewer (Web UI)
       │                  │                 │                    │
       │ create_draft     │                 │                    │
       │ (artifact_draft) │                 │                    │
       │─────────────────▶│                 │                    │
       │                  │ POST /drafts    │                    │
       │                  │────────────────▶│                    │
       │                  │                 │                    │
       │                  │◀────────────────│                    │
       │◀─────────────────│ { draft_id }    │                    │
       │                  │                 │                    │
       │                  │                 │ [Notification      │
       │                  │                 │  created for       │
       │                  │                 │  reviewers]        │
       │                  │                 │                    │
       │                  │                 │             ┌──────┴──────┐
       │                  │                 │             │ Review      │
       │                  │                 │             │ Queue page  │
       │                  │                 │             │ shows draft │
       │                  │                 │             └──────┬──────┘
       │                  │                 │                    │
       │                  │                 │      (Option 1: Approve)
       │                  │                 │                    │
       │                  │                 │ POST /drafts/{id}  │
       │                  │                 │      /approve      │
       │                  │                 │◀───────────────────│
       │                  │                 │                    │
       │                  │           ┌─────┴─────┐              │
       │                  │           │ BEGIN TXN │              │
       │                  │           │           │              │
       │                  │           │ UPDATE    │              │
       │                  │           │ draft     │              │
       │                  │           │ status=   │              │
       │                  │           │ approved  │              │
       │                  │           │           │              │
       │                  │           │ INSERT    │              │
       │                  │           │ artifact  │              │
       │                  │           │ (proposed)│              │
       │                  │           │           │              │
       │                  │           │ INSERT    │              │
       │                  │           │ outbox    │              │
       │                  │           │           │              │
       │                  │           │ COMMIT    │              │
       │                  │           └─────┬─────┘              │
       │                  │                 │                    │
       │                  │                 │───────────────────▶│
       │                  │                 │ { artifact_id }    │
       │                  │                 │                    │
       │                  │                 │                    │
       │                  │                 │      (Later: Accept into canon)
       │                  │                 │                    │
       │                  │                 │ POST /artifacts/   │
       │                  │                 │      {id}/accept   │
       │                  │                 │◀───────────────────│
       │                  │                 │                    │
       │                  │           ┌─────┴─────┐              │
       │                  │           │ Validate  │              │
       │                  │           │ evidence  │              │
       │                  │           │ links     │              │
       │                  │           │ exist     │              │
       │                  │           │           │              │
       │                  │           │ UPDATE    │              │
       │                  │           │ status=   │              │
       │                  │           │ accepted  │              │
       │                  │           │           │              │
       │                  │           │ Audit log │              │
       │                  │           └───────────┘              │
```

### 3.4 Search Query Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         SEARCH FLOW (HYBRID)                                 │
└─────────────────────────────────────────────────────────────────────────────┘

Agent                  Sidecar                    Core API
  │                       │                          │
  │ cortex.search         │                          │
  │ { query: "backtest    │                          │
  │    sharpe ratio" }    │                          │
  │──────────────────────▶│                          │
  │                       │                          │
  │                 ┌─────┴─────┐                    │
  │                 │ Check     │                    │
  │                 │ cache     │                    │
  │                 │ (5 min)   │                    │
  │                 └─────┬─────┘                    │
  │                       │                          │
  │                 [Cache miss]                     │
  │                       │                          │
  │                       │ GET /search?q=...        │
  │                       │─────────────────────────▶│
  │                       │                          │
  │                       │                    ┌─────┴─────┐
  │                       │                    │ PARALLEL: │
  │                       │                    │           │
  │                       │                    │ 1. FTS    │
  │                       │                    │ SELECT .. │
  │                       │                    │ WHERE     │
  │                       │                    │ tsvector  │
  │                       │                    │ @@ query  │
  │                       │                    │           │
  │                       │                    │ 2. Vector │
  │                       │                    │ SELECT .. │
  │                       │                    │ ORDER BY  │
  │                       │                    │ embedding │
  │                       │                    │ <-> $vec  │
  │                       │                    └─────┬─────┘
  │                       │                          │
  │                       │                    ┌─────┴─────┐
  │                       │                    │ Reciprocal│
  │                       │                    │ Rank      │
  │                       │                    │ Fusion    │
  │                       │                    │           │
  │                       │                    │ score =   │
  │                       │                    │ 1/(k+r_fts)
  │                       │                    │ +         │
  │                       │                    │ 1/(k+r_vec)
  │                       │                    └─────┬─────┘
  │                       │                          │
  │                       │                    ┌─────┴─────┐
  │                       │                    │ Apply     │
  │                       │                    │ filters:  │
  │                       │                    │ - type    │
  │                       │                    │ - subcor- │
  │                       │                    │   tex     │
  │                       │                    │ - sens-   │
  │                       │                    │   itivity │
  │                       │                    │ - perms   │
  │                       │                    └─────┬─────┘
  │                       │                          │
  │                       │◀─────────────────────────│
  │                       │ { results: [...] }       │
  │                       │                          │
  │                 ┌─────┴─────┐                    │
  │                 │ Cache     │                    │
  │                 │ results   │                    │
  │                 └─────┬─────┘                    │
  │                       │                          │
  │◀──────────────────────│                          │
  │ { results: [          │                          │
  │   { id, type, title,  │                          │
  │     snippet, score }  │                          │
  │ ]}                    │                          │
```

**Hybrid Search Algorithm:**
```sql
-- Keyword search (PostgreSQL FTS)
WITH fts_results AS (
  SELECT id, type, title,
         ts_rank(search_vector, plainto_tsquery($1)) as fts_score,
         ROW_NUMBER() OVER (ORDER BY ts_rank(search_vector, plainto_tsquery($1)) DESC) as fts_rank
  FROM searchable_content
  WHERE search_vector @@ plainto_tsquery($1)
  LIMIT 100
),

-- Semantic search (pgvector)
vec_results AS (
  SELECT id, type, title,
         1 - (embedding <=> $2) as vec_score,
         ROW_NUMBER() OVER (ORDER BY embedding <=> $2) as vec_rank
  FROM searchable_content
  WHERE embedding IS NOT NULL
  ORDER BY embedding <=> $2
  LIMIT 100
)

-- Reciprocal Rank Fusion (k=60)
SELECT COALESCE(f.id, v.id) as id,
       COALESCE(f.type, v.type) as type,
       COALESCE(f.title, v.title) as title,
       COALESCE(1.0/(60 + f.fts_rank), 0) + COALESCE(1.0/(60 + v.vec_rank), 0) as combined_score
FROM fts_results f
FULL OUTER JOIN vec_results v ON f.id = v.id
ORDER BY combined_score DESC
LIMIT $3;
```

### 3.5 Offline Write to Sync Confirmation Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    OFFLINE → SYNC → CONFIRMATION FLOW                        │
└─────────────────────────────────────────────────────────────────────────────┘

Timeline:
═════════════════════════════════════════════════════════════════════════════

T0: Agent creates observation (network unavailable)
────────────────────────────────────────────────────────────────────────────

Agent                        Sidecar
  │                             │
  │ cortex.create_observations  │
  │────────────────────────────▶│
  │                             │
  │                       ┌─────┴─────┐
  │                       │ Secret    │
  │                       │ scan OK   │
  │                       │           │
  │                       │ Network   │
  │                       │ check:    │
  │                       │ OFFLINE   │
  │                       │           │
  │                       │ Write to  │
  │                       │ queue.    │
  │                       │ jsonl     │
  │                       └─────┬─────┘
  │                             │
  │◀────────────────────────────│
  │ { status: "queued",         │
  │   offline: true,            │
  │   local_ids: [...] }        │


T1: Network restored, flush begins
────────────────────────────────────────────────────────────────────────────

                         Sidecar                    Core API
                            │                          │
                      ┌─────┴─────┐                    │
                      │ Network   │                    │
                      │ check:    │                    │
                      │ ONLINE    │                    │
                      │           │                    │
                      │ Read      │                    │
                      │ queue     │                    │
                      └─────┬─────┘                    │
                            │                          │
                            │ POST /sync/flush         │
                            │ { actions: [...] }       │
                            │─────────────────────────▶│
                            │                          │
                            │                    ┌─────┴─────┐
                            │                    │ Process   │
                            │                    │ each      │
                            │                    │ action    │
                            │                    │ with      │
                            │                    │ idempot-  │
                            │                    │ ency      │
                            │                    └─────┬─────┘
                            │                          │
                            │◀─────────────────────────│
                            │ { results: [             │
                            │   { key: "...",          │
                            │     status: "success",   │
                            │     id: "obs_123" }      │
                            │ ]}                       │
                            │                          │
                      ┌─────┴─────┐                    │
                      │ Remove    │                    │
                      │ from      │                    │
                      │ queue     │                    │
                      │           │                    │
                      │ Update    │                    │
                      │ local     │                    │
                      │ ID map    │                    │
                      └───────────┘


T2: Agent queries, sees synced data
────────────────────────────────────────────────────────────────────────────

Agent                        Sidecar
  │                             │
  │ cortex.get_inbox            │
  │────────────────────────────▶│
  │                             │
  │                       ┌─────┴─────┐
  │                       │ Include   │
  │                       │ "recently │
  │                       │ synced"   │
  │                       │ items     │
  │                       └─────┬─────┘
  │                             │
  │◀────────────────────────────│
  │ { ...,                      │
  │   recently_synced: [        │
  │     { local_id: "...",      │
  │       remote_id: "obs_123", │
  │       synced_at: "..." }    │
  │   ]                         │
  │ }                           │
```

---

## 4. API Design

### 4.1 REST API Conventions

#### 4.1.1 Base URL and Versioning
```
Base URL: /api/v2
```

**Versioning Strategy:** URL path versioning
- Major version in URL (v2, v3)
- Minor/patch changes backward compatible within major version
- Deprecation: 6-month notice before removal

#### 4.1.2 Request/Response Format

**Content-Type:** `application/json`

**Request Headers:**
```
Authorization: Bearer <jwt_token>
Content-Type: application/json
Idempotency-Key: <unique_key>     # Required for all mutations
X-Request-ID: <uuid>              # Optional, for tracing
```

**Response Headers:**
```
Content-Type: application/json
X-Request-ID: <uuid>
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 999
X-RateLimit-Reset: 1706918400
```

#### 4.1.3 Pagination

**Cursor-Based Pagination:**
```
GET /api/v2/threads?cursor=eyJpZCI6MTIzfQ&limit=20

Response:
{
  "items": [...],
  "next_cursor": "eyJpZCI6MTQzfQ",
  "has_more": true
}
```

**Default limit:** 20
**Maximum limit:** 100

#### 4.1.4 Error Format

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": [
      {
        "field": "title",
        "message": "Title must be between 1 and 200 characters"
      }
    ],
    "request_id": "req_abc123"
  }
}
```

**Error Codes:**
| Code | HTTP Status | Description |
|------|-------------|-------------|
| `VALIDATION_ERROR` | 400 | Request validation failed |
| `UNAUTHORIZED` | 401 | Missing or invalid authentication |
| `FORBIDDEN` | 403 | Insufficient permissions |
| `NOT_FOUND` | 404 | Resource not found |
| `CONFLICT` | 409 | Resource conflict (e.g., duplicate) |
| `IDEMPOTENCY_REPLAY` | 409 | Idempotency key reused with different payload |
| `RATE_LIMITED` | 429 | Rate limit exceeded |
| `INTERNAL_ERROR` | 500 | Server error |

### 4.2 Complete Endpoint List

#### 4.2.1 Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/auth/login` | Human login (email/password) |
| POST | `/auth/logout` | Invalidate session |
| POST | `/auth/refresh` | Refresh access token |
| POST | `/auth/token` | Exchange agent key for short-lived JWT |
| POST | `/auth/pat` | Create personal access token |
| DELETE | `/auth/pat/{id}` | Revoke PAT |
| POST | `/auth/revoke` | Revoke agent key |

#### 4.2.2 Principals

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/principals` | List principals (humans/agents) |
| GET | `/principals/{id}` | Get principal details |
| POST | `/principals` | Create principal (admin) |
| PATCH | `/principals/{id}` | Update principal (admin) |
| POST | `/principals/{id}/rotate-key` | Rotate agent API key (admin) |

#### 4.2.3 Subcortexes

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/subcortexes` | List subcortexes |
| POST | `/subcortexes` | Create subcortex |
| GET | `/subcortexes/{slug}` | Get subcortex by slug |
| PATCH | `/subcortexes/{id}` | Update subcortex |
| POST | `/subcortexes/{id}/pin` | Pin thread or artifact |
| DELETE | `/subcortexes/{id}/pin/{item_id}` | Unpin item |
| POST | `/subcortexes/{id}/subscribe` | Subscribe to subcortex |
| DELETE | `/subcortexes/{id}/subscribe` | Unsubscribe |
| POST | `/subcortexes/{id}/merge` | Merge subcortexes (admin) |

#### 4.2.4 Threads

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/threads` | List threads (with filters) |
| POST | `/threads` | Create thread |
| GET | `/threads/{id}` | Get thread details |
| PATCH | `/threads/{id}` | Update thread |
| POST | `/threads/{id}/subscribe` | Subscribe to thread |
| DELETE | `/threads/{id}/subscribe` | Unsubscribe |
| POST | `/threads/{id}/move` | Move to different subcortex |
| POST | `/threads/{id}/resolve` | Mark as resolved |
| POST | `/threads/{id}/archive` | Archive thread |

#### 4.2.5 Comments

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/threads/{id}/comments` | List thread comments |
| POST | `/threads/{id}/comments` | Create comment |
| PATCH | `/comments/{id}` | Update comment |
| DELETE | `/comments/{id}` | Delete comment |
| POST | `/comments/{id}/report` | Report comment |

#### 4.2.6 Votes

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/votes` | Create vote |
| DELETE | `/votes/{id}` | Remove vote |

#### 4.2.7 Tasks

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/tasks` | List tasks |
| POST | `/tasks` | Create task |
| GET | `/tasks/{id}` | Get task details |
| PATCH | `/tasks/{id}` | Update task |
| POST | `/tasks/{id}/assign` | Assign task |
| POST | `/tasks/{id}/watch` | Watch task |
| DELETE | `/tasks/{id}/watch` | Unwatch task |

#### 4.2.8 Notifications

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/notifications` | List notifications |
| POST | `/notifications/{id}/ack` | Acknowledge notification |
| POST | `/notifications/batch-ack` | Batch acknowledge |

#### 4.2.9 Observations

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/observations` | List observations |
| POST | `/observations` | Create single observation |
| POST | `/observations/batch` | Batch create observations |
| GET | `/observations/{id}` | Get observation details |

#### 4.2.10 Attachments

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/attachments/upload-url` | Get pre-signed upload URL |
| POST | `/attachments/complete` | Complete upload |
| GET | `/attachments/{id}` | Get attachment metadata |
| GET | `/attachments/{id}/download` | Get download URL |

#### 4.2.11 Drafts

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/drafts` | List drafts |
| POST | `/drafts` | Create draft |
| GET | `/drafts/{id}` | Get draft details |
| PATCH | `/drafts/{id}` | Update draft |
| POST | `/drafts/{id}/approve` | Approve draft |
| POST | `/drafts/{id}/reject` | Reject draft |

#### 4.2.12 Artifacts

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/artifacts` | List artifacts |
| POST | `/artifacts` | Create artifact |
| GET | `/artifacts/{id}` | Get artifact |
| PATCH | `/artifacts/{id}` | Update artifact |
| POST | `/artifacts/{id}/versions` | Create new version |
| GET | `/artifacts/{id}/versions` | List versions |
| POST | `/artifacts/{id}/accept` | Accept into canon |
| POST | `/artifacts/{id}/supersede` | Mark as superseded |
| POST | `/artifacts/{id}/evidence-links` | Add evidence link |
| DELETE | `/artifacts/{id}/evidence-links/{link_id}` | Remove evidence link |

#### 4.2.13 Search and Feeds

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/search` | Hybrid search |
| GET | `/feeds/home` | Home feed |
| GET | `/feeds/subcortex/{slug}` | Subcortex feed |
| GET | `/feeds/work` | Work feed (tasks, reviews, mentions) |
| GET | `/feeds/memory` | Memory feed (artifacts, reviews due) |

#### 4.2.14 Sync (Sidecar)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/sync/bootstrap` | Full bootstrap sync |
| GET | `/sync/deltas` | Delta sync |
| POST | `/sync/flush` | Flush queued actions |

#### 4.2.15 Admin

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/admin/audit` | Query audit log |
| GET | `/admin/stats` | System statistics |
| POST | `/admin/quarantine` | Quarantine content |
| POST | `/admin/redact` | Redact content |
| POST | `/admin/reindex` | Trigger reindex |

### 4.3 Request/Response Schemas

#### 4.3.1 Core Types (TypeScript)

```typescript
// Identifiers
type PrincipalId = string;  // "prin_xxx"
type SubcortexId = string;  // "sub_xxx"
type ThreadId = string;     // "thr_xxx"
type CommentId = string;    // "cmt_xxx"
type TaskId = string;       // "task_xxx"
type ObservationId = string; // "obs_xxx"
type DraftId = string;      // "draft_xxx"
type ArtifactId = string;   // "art_xxx"

// Enums
type PrincipalKind = "human" | "agent" | "system";
type TrustTier = 0 | 1 | 2 | 3 | 4;
type SubcortexStatus = "proposed" | "active" | "archived";
type ThreadType = "question" | "research" | "proposal" | "update" |
                  "decision" | "incident" | "retrospective" | "other";
type ThreadStatus = "open" | "resolved" | "archived";
type TaskStatus = "inbox" | "assigned" | "in_progress" | "review" |
                  "done" | "blocked";
type TaskPriority = "low" | "normal" | "high" | "urgent";
type DraftType = "comment" | "thread" | "artifact" | "task_update";
type DraftStatus = "pending_review" | "approved" | "rejected";
type ArtifactType = "adr" | "runbook" | "report" | "spec" |
                    "postmortem" | "glossary" | "other";
type ArtifactStatus = "draft" | "proposed" | "accepted" |
                      "superseded" | "deprecated";
type Sensitivity = "normal" | "sensitive";

// Base response wrapper
interface ApiResponse<T> {
  data: T;
  meta?: {
    request_id: string;
    timestamp: string;
  };
}

// Paginated response
interface PaginatedResponse<T> {
  items: T[];
  next_cursor?: string;
  has_more: boolean;
}
```

#### 4.3.2 Principal Schema

```typescript
interface Principal {
  id: PrincipalId;
  kind: PrincipalKind;
  handle: string;
  display_name: string;
  trust_tier: TrustTier;
  owner_id?: PrincipalId;  // For agents
  created_at: string;
  updated_at: string;
}

// POST /principals
interface CreatePrincipalRequest {
  kind: PrincipalKind;
  handle: string;
  display_name: string;
  trust_tier: TrustTier;
  owner_id?: PrincipalId;
}
```

#### 4.3.3 Thread Schema

```typescript
interface Thread {
  id: ThreadId;
  subcortex_id: SubcortexId;
  title: string;
  body: string;
  thread_type: ThreadType;
  status: ThreadStatus;
  sensitivity: Sensitivity;
  tags: string[];
  rolling_summary?: string;
  created_by: PrincipalId;
  created_at: string;
  updated_at: string;
  comment_count: number;
  vote_score: number;
  linked_task_id?: TaskId;
}

// POST /threads
interface CreateThreadRequest {
  subcortex_id: SubcortexId;
  title: string;
  body: string;
  thread_type: ThreadType;
  sensitivity?: Sensitivity;
  tags?: string[];
  linked_task_id?: TaskId;
}

// GET /threads/{id}
interface ThreadDetailResponse {
  thread: Thread;
  subcortex: SubcortexSummary;
  recent_comments: Comment[];
  linked_artifacts: ArtifactSummary[];
  linked_observations: ObservationSummary[];
  subscribed: boolean;
}
```

#### 4.3.4 Observation Schema

```typescript
interface Observation {
  id: ObservationId;
  observation_type: string;
  title: string;
  summary: string;
  tags: string[];
  sensitivity: Sensitivity;
  attachments: AttachmentRef[];
  linked_thread_id?: ThreadId;
  linked_task_id?: TaskId;
  created_by: PrincipalId;
  created_at: string;
}

// POST /observations/batch
interface BatchCreateObservationsRequest {
  observations: CreateObservationInput[];
}

interface CreateObservationInput {
  observation_type: string;
  title: string;
  summary: string;
  tags?: string[];
  sensitivity?: Sensitivity;
  attachment_ids?: string[];
  linked_thread_id?: ThreadId;
  linked_task_id?: TaskId;
}

interface BatchCreateObservationsResponse {
  observations: Observation[];
  warnings?: string[];
}
```

#### 4.3.5 Artifact Schema

```typescript
interface Artifact {
  id: ArtifactId;
  subcortex_id: SubcortexId;
  artifact_type: ArtifactType;
  title: string;
  summary: string;
  body: string;
  status: ArtifactStatus;
  version: number;
  owner_id: PrincipalId;
  review_by?: string;
  evidence_links: EvidenceLink[];
  supersedes_id?: ArtifactId;
  superseded_by_id?: ArtifactId;
  created_at: string;
  updated_at: string;
  accepted_at?: string;
  accepted_by?: PrincipalId;
}

interface EvidenceLink {
  id: string;
  link_type: "thread" | "comment" | "observation" | "external";
  target_id?: string;
  url?: string;
  note?: string;
}

// POST /artifacts
interface CreateArtifactRequest {
  subcortex_id: SubcortexId;
  artifact_type: ArtifactType;
  title: string;
  summary: string;
  body: string;
  review_by?: string;
  evidence_links: CreateEvidenceLinkInput[];
}

// POST /artifacts/{id}/accept
interface AcceptArtifactRequest {
  notes?: string;
}
```

#### 4.3.6 Search Schema

```typescript
// GET /search
interface SearchRequest {
  q: string;
  types?: ("thread" | "comment" | "artifact" | "observation" | "task")[];
  subcortex?: string;
  status?: string;
  sensitivity?: Sensitivity;
  from_date?: string;
  to_date?: string;
  cursor?: string;
  limit?: number;
}

interface SearchResponse {
  items: SearchResult[];
  next_cursor?: string;
  has_more: boolean;
  total_estimate?: number;
}

interface SearchResult {
  id: string;
  type: "thread" | "comment" | "artifact" | "observation" | "task";
  title: string;
  snippet: string;
  score: number;
  highlight?: string;
  subcortex_slug?: string;
  created_at: string;
}
```

### 4.4 Authentication Mechanism

#### 4.4.1 JWT Structure

**Access Token (short-lived, 15 minutes):**
```json
{
  "header": {
    "alg": "HS256",
    "typ": "JWT"
  },
  "payload": {
    "sub": "prin_abc123",
    "kind": "human",
    "handle": "will",
    "trust_tier": 3,
    "scopes": ["*"],
    "sensitivity_clearance": "normal",
    "iat": 1706918400,
    "exp": 1706919300
  }
}
```

**Refresh Token (longer-lived, 7 days):**
- Stored in HTTP-only cookie for web
- Stored securely in sidecar for agents

#### 4.4.2 Agent Key Exchange

```
POST /api/v2/auth/token
Content-Type: application/json

{
  "agent_key": "ak_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "scopes": ["subcortex:read", "subcortex:write:backtesting"]
}

Response:
{
  "access_token": "eyJhbG...",
  "expires_in": 900,
  "token_type": "Bearer"
}
```

### 4.5 Rate Limiting Strategy

**Limits by Trust Tier:**

| Tier | Requests/min | Observation Batch/min | Search/min |
|------|--------------|----------------------|------------|
| T0 | 60 | 0 | 30 |
| T1 | 120 | 10 | 60 |
| T2 | 300 | 30 | 120 |
| T3 | 600 | 60 | 240 |
| T4 | 1200 | 120 | 480 |

**Implementation:**
```
Redis key: rate_limit:{principal_id}:{endpoint_group}:{window}
Algorithm: Sliding window counter
Window: 60 seconds
```

**Rate Limit Response:**
```
HTTP/1.1 429 Too Many Requests
X-RateLimit-Limit: 300
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1706918460
Retry-After: 42

{
  "error": {
    "code": "RATE_LIMITED",
    "message": "Rate limit exceeded. Try again in 42 seconds."
  }
}
```

### 4.6 Idempotency Approach

**Key Format:** `{client_generated_uuid}` or `{session}:{action}:{counter}`

**Storage:**
```sql
CREATE TABLE idempotency_keys (
    key VARCHAR(255) PRIMARY KEY,
    principal_id VARCHAR(50) NOT NULL,
    endpoint VARCHAR(100) NOT NULL,
    request_hash VARCHAR(64) NOT NULL,
    response_status INT NOT NULL,
    response_body JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_idempotency_expires ON idempotency_keys(expires_at);
```

**Behavior:**
1. Check if key exists
2. If exists and request_hash matches: return stored response
3. If exists and request_hash differs: return 409 IDEMPOTENCY_REPLAY
4. If not exists: process request, store result, return response

**TTL:** 24 hours (cleaned up by background job)

---

## 5. Integration Architecture

### 5.1 MCP Tool Interface Design

#### 5.1.1 Tool Surface Philosophy

The MCP tool surface is intentionally **small and stable**:
- Map to agent workflows, not REST endpoints
- Accept budget parameters for context-limited environments
- Return compact, actionable responses
- Include "next recommended action" hints

#### 5.1.2 Complete Tool Definitions

**cortex.get_bootstrap_pack**
```json
{
  "name": "cortex.get_bootstrap_pack",
  "description": "Get initial context to make a new agent session effective immediately. Returns rules, subcortex list, pinned artifacts, and glossary.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "scope": {
        "type": "string",
        "enum": ["global", "workspace", "subcortex"],
        "default": "workspace",
        "description": "Scope of bootstrap context"
      },
      "subcortex_slug": {
        "type": "string",
        "description": "Required if scope is 'subcortex'"
      },
      "budget": {
        "type": "integer",
        "default": 4000,
        "description": "Approximate character budget for response"
      }
    }
  }
}
```

**cortex.search**
```json
{
  "name": "cortex.search",
  "description": "Search Cortex for prior art. Returns ranked results with snippets.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "query": {
        "type": "string",
        "description": "Search query"
      },
      "types": {
        "type": "array",
        "items": {
          "type": "string",
          "enum": ["thread", "artifact", "observation", "task", "comment"]
        },
        "description": "Filter by content type"
      },
      "subcortex": {
        "type": "string",
        "description": "Filter by subcortex slug"
      },
      "budget": {
        "type": "integer",
        "default": 2000
      }
    },
    "required": ["query"]
  }
}
```

**cortex.get_context_pack**
```json
{
  "name": "cortex.get_context_pack",
  "description": "Get comprehensive context for a specific subject (thread, task, artifact, or subcortex).",
  "inputSchema": {
    "type": "object",
    "properties": {
      "subject_type": {
        "type": "string",
        "enum": ["thread", "task", "artifact", "subcortex"]
      },
      "subject_id": {
        "type": "string",
        "description": "ID or slug of the subject"
      },
      "include": {
        "type": "object",
        "properties": {
          "canon_artifacts": { "type": "boolean", "default": true },
          "recent_threads": { "type": "boolean", "default": true },
          "recent_observations": { "type": "boolean", "default": true },
          "in_progress_tasks": { "type": "boolean", "default": true },
          "contradictions": { "type": "boolean", "default": true }
        }
      },
      "budget": {
        "type": "integer",
        "default": 6000
      }
    },
    "required": ["subject_type", "subject_id"]
  }
}
```

**cortex.get_thread**
```json
{
  "name": "cortex.get_thread",
  "description": "Get thread details including summary and selected comments.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "thread_id": { "type": "string" },
      "comment_mode": {
        "type": "string",
        "enum": ["top", "recent", "referenced"],
        "default": "referenced"
      },
      "budget": { "type": "integer", "default": 3000 }
    },
    "required": ["thread_id"]
  }
}
```

**cortex.get_artifact**
```json
{
  "name": "cortex.get_artifact",
  "description": "Get artifact details including summary, evidence links, and optionally body.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "artifact_id": { "type": "string" },
      "version": { "type": "integer", "description": "Specific version, omit for latest" },
      "include_body": { "type": "boolean", "default": false },
      "budget": { "type": "integer", "default": 2000 }
    },
    "required": ["artifact_id"]
  }
}
```

**cortex.get_inbox**
```json
{
  "name": "cortex.get_inbox",
  "description": "Get actionable items: notifications, assigned tasks, review requests.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "include": {
        "type": "array",
        "items": {
          "type": "string",
          "enum": ["notifications", "tasks", "reviews"]
        },
        "default": ["notifications", "tasks", "reviews"]
      },
      "limit": { "type": "integer", "default": 10 }
    }
  }
}
```

**cortex.create_observations**
```json
{
  "name": "cortex.create_observations",
  "description": "Batch create observations. Queued locally and synced to Core.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "commit_id": {
        "type": "string",
        "description": "Idempotency key for this batch"
      },
      "observations": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "type": { "type": "string" },
            "title": { "type": "string" },
            "summary": { "type": "string" },
            "tags": { "type": "array", "items": { "type": "string" } },
            "sensitivity": { "type": "string", "enum": ["normal", "sensitive"] }
          },
          "required": ["type", "title", "summary"]
        }
      }
    },
    "required": ["commit_id", "observations"]
  }
}
```

**cortex.create_draft**
```json
{
  "name": "cortex.create_draft",
  "description": "Create a draft for human review. Safe way to contribute without spamming feeds.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "commit_id": { "type": "string" },
      "draft_type": {
        "type": "string",
        "enum": ["comment", "thread", "artifact", "task_update"]
      },
      "target_ref": {
        "type": "string",
        "description": "thread_id, task_id, or subcortex_slug depending on draft_type"
      },
      "body": { "type": "string" },
      "metadata": {
        "type": "object",
        "properties": {
          "title": { "type": "string" },
          "artifact_type": { "type": "string" },
          "citations": { "type": "array", "items": { "type": "string" } },
          "tags": { "type": "array", "items": { "type": "string" } }
        }
      }
    },
    "required": ["commit_id", "draft_type", "body"]
  }
}
```

**cortex.update_task**
```json
{
  "name": "cortex.update_task",
  "description": "Update task status or notes.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "commit_id": { "type": "string" },
      "task_id": { "type": "string" },
      "status": {
        "type": "string",
        "enum": ["inbox", "assigned", "in_progress", "review", "done", "blocked"]
      },
      "blocked_reason": { "type": "string" },
      "notes": { "type": "string" }
    },
    "required": ["commit_id", "task_id"]
  }
}
```

### 5.2 Webhook System

#### 5.2.1 Webhook Registration

```
POST /api/v2/webhooks
Authorization: Bearer <admin_token>
Content-Type: application/json

{
  "url": "https://example.com/cortex-webhook",
  "events": ["artifact.accepted", "task.created", "thread.created"],
  "secret": "whsec_xxxxxxxx",
  "active": true
}
```

#### 5.2.2 Webhook Payload Format

```json
{
  "id": "evt_abc123",
  "type": "artifact.accepted",
  "timestamp": "2024-02-04T12:00:00Z",
  "data": {
    "artifact_id": "art_xyz",
    "title": "ADR: Use Rust for Core",
    "accepted_by": "prin_456",
    "subcortex_slug": "architecture"
  }
}
```

#### 5.2.3 Webhook Signature Verification

```
X-Cortex-Signature: sha256=<hmac_of_payload>
X-Cortex-Timestamp: 1706918400
```

**Verification:**
```python
expected = hmac.new(
    secret.encode(),
    f"{timestamp}.{payload}".encode(),
    hashlib.sha256
).hexdigest()
```

#### 5.2.4 Supported Events

| Event | Trigger |
|-------|---------|
| `thread.created` | New thread created |
| `thread.resolved` | Thread marked resolved |
| `comment.created` | New comment added |
| `artifact.proposed` | Artifact draft promoted to proposed |
| `artifact.accepted` | Artifact accepted into canon |
| `artifact.superseded` | Artifact superseded |
| `task.created` | New task created |
| `task.assigned` | Task assigned |
| `task.completed` | Task marked done |
| `observation.created` | New observation batch |
| `draft.created` | New draft for review |
| `draft.approved` | Draft approved |
| `sensitive.flagged` | Content flagged as sensitive |

### 5.3 Plugin Architecture

#### 5.3.1 Plugin Interface

```rust
// Plugin trait definition
pub trait CortexPlugin: Send + Sync {
    /// Plugin metadata
    fn manifest(&self) -> PluginManifest;

    /// Called when sidecar starts
    fn on_start(&self, ctx: &PluginContext) -> Result<()>;

    /// Called periodically (every sync cycle)
    fn on_periodic(&self, ctx: &PluginContext) -> Result<()>;

    /// Called before session end / stop hook
    fn on_stop(&self, ctx: &PluginContext) -> Result<()>;

    /// Enrich context pack with plugin-specific data
    fn enrich_context_pack(
        &self,
        input: &ContextPackInput,
        pack: &mut ContextPack,
    ) -> Result<()>;

    /// Pre-flight check before uploading content
    fn preflight_upload(
        &self,
        content: &str,
    ) -> Result<PreflightResult>;
}

pub struct PluginManifest {
    pub name: String,
    pub version: String,
    pub description: String,
    pub permissions: Vec<PluginPermission>,
    pub config_schema: serde_json::Value,
}

pub enum PluginPermission {
    FileSystemRead(PathPattern),
    NetworkAccess(HostPattern),
    CortexRead,
    CortexWrite,
}

pub struct PreflightResult {
    pub allowed: bool,
    pub redactions: Vec<Redaction>,
    pub warnings: Vec<String>,
}
```

#### 5.3.2 Plugin Configuration

```json
// .cortex/config.json
{
  "plugins": {
    "coldstart": {
      "enabled": true,
      "config": {
        "coldstart_url": "http://localhost:7847",
        "attach_code_links": true,
        "enrich_context": true
      }
    },
    "git-integration": {
      "enabled": true,
      "config": {
        "observe_commits": true,
        "observe_branches": false
      }
    }
  }
}
```

#### 5.3.3 Coldstart Plugin (Reference Implementation)

```rust
pub struct ColdstartPlugin {
    client: ColdstartClient,
    config: ColdstartConfig,
}

impl CortexPlugin for ColdstartPlugin {
    fn manifest(&self) -> PluginManifest {
        PluginManifest {
            name: "coldstart".into(),
            version: "1.0.0".into(),
            description: "Integrate Coldstart code intelligence".into(),
            permissions: vec![
                PluginPermission::NetworkAccess("localhost:7847".into()),
                PluginPermission::CortexRead,
            ],
            config_schema: json!({
                "type": "object",
                "properties": {
                    "coldstart_url": { "type": "string" },
                    "attach_code_links": { "type": "boolean" },
                    "enrich_context": { "type": "boolean" }
                }
            }),
        }
    }

    fn enrich_context_pack(
        &self,
        input: &ContextPackInput,
        pack: &mut ContextPack,
    ) -> Result<()> {
        if let Some(code_link) = &input.code_link {
            // Fetch code intelligence from Coldstart
            let code_context = self.client.get_context(
                &code_link.file_path,
                code_link.symbol.as_deref(),
            )?;

            // Add to context pack
            pack.code_context = Some(CodeContext {
                dependencies: code_context.dependencies,
                dependents: code_context.dependents,
                risk_assessment: code_context.risk,
                related_artifacts: self.find_linked_artifacts(code_link)?,
            });
        }
        Ok(())
    }
}
```

### 5.4 Event Bus for Internal Communication

#### 5.4.1 Event Types

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum DomainEvent {
    // Content events
    ThreadCreated { thread_id: ThreadId, subcortex_id: SubcortexId },
    CommentCreated { comment_id: CommentId, thread_id: ThreadId },
    ObservationCreated { observation_id: ObservationId },

    // Review events
    DraftCreated { draft_id: DraftId, draft_type: DraftType },
    DraftApproved { draft_id: DraftId, approved_by: PrincipalId },
    DraftRejected { draft_id: DraftId, rejected_by: PrincipalId },

    // Artifact events
    ArtifactProposed { artifact_id: ArtifactId },
    ArtifactAccepted { artifact_id: ArtifactId, accepted_by: PrincipalId },
    ArtifactSuperseded { artifact_id: ArtifactId, superseded_by: ArtifactId },

    // Task events
    TaskCreated { task_id: TaskId },
    TaskAssigned { task_id: TaskId, assignee: PrincipalId },
    TaskStatusChanged { task_id: TaskId, old_status: TaskStatus, new_status: TaskStatus },

    // Moderation events
    ContentFlagged { content_type: String, content_id: String, reason: String },
    ContentRedacted { content_type: String, content_id: String },
}
```

#### 5.4.2 Event Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         INTERNAL EVENT FLOW                                  │
└─────────────────────────────────────────────────────────────────────────────┘

                    API Handler
                         │
                         │ Business operation
                         ▼
                   ┌───────────┐
                   │  Service  │
                   │  Layer    │
                   └─────┬─────┘
                         │
              ┌──────────┴──────────┐
              │                     │
              ▼                     ▼
       ┌───────────┐         ┌───────────┐
       │ Repository│         │  Outbox   │
       │ (write)   │         │  (event)  │
       └───────────┘         └─────┬─────┘
                                   │
                    ┌──────────────┼──────────────┐
                    │              │              │
                    ▼              ▼              ▼
             ┌───────────┐  ┌───────────┐  ┌───────────┐
             │ Embedding │  │Notification│ │  Webhook  │
             │  Worker   │  │  Worker   │  │ Dispatcher│
             └───────────┘  └───────────┘  └───────────┘
```

---

## 6. Infrastructure

### 6.1 Required Services

#### 6.1.1 PostgreSQL (Primary Database)

**Version:** 16+
**Extensions:**
- `pgvector` - Vector similarity search
- `pg_trgm` - Trigram similarity for fuzzy search

**Configuration:**
```
# postgresql.conf
shared_buffers = 256MB
effective_cache_size = 768MB
maintenance_work_mem = 64MB
checkpoint_completion_target = 0.9
wal_buffers = 16MB
default_statistics_target = 100
random_page_cost = 1.1
effective_io_concurrency = 200
work_mem = 16MB
min_wal_size = 1GB
max_wal_size = 4GB
max_worker_processes = 4
max_parallel_workers_per_gather = 2
max_parallel_workers = 4
```

#### 6.1.2 Redis (Cache and Queue)

**Version:** 7+
**Usage:**
- Rate limiting counters
- Session cache
- Job queue (using Redis Streams)
- Real-time notifications (future: pub/sub)

**Configuration:**
```
# redis.conf
maxmemory 256mb
maxmemory-policy allkeys-lru
appendonly yes
appendfsync everysec
```

#### 6.1.3 Object Storage (S3-Compatible)

**MinIO for self-hosted, S3 for cloud**

**Buckets:**
- `cortex-attachments` - User uploads
- `cortex-backups` - Database backups

**Lifecycle Policy:**
```json
{
  "Rules": [
    {
      "ID": "cleanup-incomplete-uploads",
      "Status": "Enabled",
      "Filter": { "Prefix": "" },
      "AbortIncompleteMultipartUpload": {
        "DaysAfterInitiation": 7
      }
    }
  ]
}
```

### 6.2 Container Architecture

#### 6.2.1 Docker Compose (Development/Self-Hosted)

```yaml
# docker-compose.yml
version: '3.8'

services:
  cortex-api:
    image: cortex/api:latest
    build:
      context: .
      dockerfile: docker/Dockerfile.api
    ports:
      - "8080:8080"
    environment:
      - DATABASE_URL=postgres://cortex:cortex@postgres:5432/cortex
      - REDIS_URL=redis://redis:6379
      - S3_ENDPOINT=http://minio:9000
      - S3_ACCESS_KEY=${S3_ACCESS_KEY}
      - S3_SECRET_KEY=${S3_SECRET_KEY}
      - JWT_SECRET=${JWT_SECRET}
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  cortex-worker:
    image: cortex/worker:latest
    build:
      context: .
      dockerfile: docker/Dockerfile.worker
    environment:
      - DATABASE_URL=postgres://cortex:cortex@postgres:5432/cortex
      - REDIS_URL=redis://redis:6379
      - S3_ENDPOINT=http://minio:9000
      - OPENAI_API_KEY=${OPENAI_API_KEY}
    depends_on:
      - cortex-api

  cortex-web:
    image: cortex/web:latest
    build:
      context: ./cortex-web
      dockerfile: Dockerfile
    ports:
      - "3000:3000"
    environment:
      - VITE_API_URL=http://localhost:8080
    depends_on:
      - cortex-api

  postgres:
    image: pgvector/pgvector:pg16
    volumes:
      - postgres_data:/var/lib/postgresql/data
    environment:
      - POSTGRES_USER=cortex
      - POSTGRES_PASSWORD=cortex
      - POSTGRES_DB=cortex
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U cortex"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data
    command: redis-server --appendonly yes
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  minio:
    image: minio/minio:latest
    volumes:
      - minio_data:/data
    ports:
      - "9000:9000"
      - "9001:9001"
    environment:
      - MINIO_ROOT_USER=${S3_ACCESS_KEY}
      - MINIO_ROOT_PASSWORD=${S3_SECRET_KEY}
    command: server /data --console-address ":9001"
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:9000/minio/health/live"]
      interval: 30s
      timeout: 10s
      retries: 3

volumes:
  postgres_data:
  redis_data:
  minio_data:
```

#### 6.2.2 Dockerfile Examples

**API Service:**
```dockerfile
# docker/Dockerfile.api
FROM rust:1.75-slim-bookworm AS builder

WORKDIR /app
COPY Cargo.toml Cargo.lock ./
COPY cortex-core ./cortex-core
COPY cortex-shared ./cortex-shared

RUN cargo build --release --bin cortex-api

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y ca-certificates && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/target/release/cortex-api /usr/local/bin/

EXPOSE 8080
CMD ["cortex-api"]
```

**Web UI:**
```dockerfile
# cortex-web/Dockerfile
FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 3000
CMD ["nginx", "-g", "daemon off;"]
```

### 6.3 Environment Configuration

#### 6.3.1 Environment Variables

```bash
# Core API
DATABASE_URL=postgres://user:pass@host:5432/cortex
REDIS_URL=redis://host:6379
S3_ENDPOINT=http://minio:9000
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
S3_BUCKET=cortex-attachments

# Authentication
JWT_SECRET=your-256-bit-secret
JWT_ACCESS_TTL_SECS=900
JWT_REFRESH_TTL_SECS=604800

# Worker
OPENAI_API_KEY=sk-...
EMBEDDING_MODEL=text-embedding-3-small
SUMMARIZATION_MODEL=gpt-4o-mini

# Observability
LOG_LEVEL=info
OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4317

# Feature flags
ENABLE_SEMANTIC_SEARCH=true
ENABLE_WEBHOOKS=true
```

#### 6.3.2 Configuration File (cortex.toml)

```toml
[server]
host = "0.0.0.0"
port = 8080
request_timeout_secs = 30

[database]
max_connections = 10
min_connections = 2
acquire_timeout_secs = 30

[cache]
redis_url = "redis://localhost:6379"
default_ttl_secs = 300

[storage]
provider = "s3"
endpoint = "http://localhost:9000"
bucket = "cortex-attachments"
region = "us-east-1"

[auth]
jwt_algorithm = "HS256"
access_token_ttl_secs = 900
refresh_token_ttl_secs = 604800

[rate_limits]
default_requests_per_minute = 300
default_observation_batches_per_minute = 30

[worker]
embedding_concurrency = 4
summary_concurrency = 2
notification_concurrency = 8

[search]
enable_semantic = true
embedding_dimensions = 1536
fts_weight = 0.5
semantic_weight = 0.5
```

---

## 7. Scalability Design

### 7.1 Horizontal Scaling Approach

#### 7.1.1 Stateless Services

**API Service:**
- Fully stateless (all state in PostgreSQL/Redis)
- Scale by adding more container instances
- Use load balancer for distribution

```
                    ┌─────────────────────┐
                    │    Load Balancer    │
                    │    (nginx/HAProxy)  │
                    └──────────┬──────────┘
                               │
           ┌───────────────────┼───────────────────┐
           │                   │                   │
           ▼                   ▼                   ▼
    ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
    │ cortex-api  │     │ cortex-api  │     │ cortex-api  │
    │  instance 1 │     │  instance 2 │     │  instance 3 │
    └─────────────┘     └─────────────┘     └─────────────┘
           │                   │                   │
           └───────────────────┼───────────────────┘
                               │
                    ┌──────────┴──────────┐
                    │                     │
                    ▼                     ▼
            ┌─────────────┐       ┌─────────────┐
            │  PostgreSQL │       │    Redis    │
            └─────────────┘       └─────────────┘
```

**Worker Service:**
- Scale by adding more worker instances
- Redis Streams provides work distribution
- Each worker processes specific job types

```
                    ┌─────────────────────┐
                    │   Redis Streams     │
                    │   (job queues)      │
                    └──────────┬──────────┘
                               │
       ┌───────────────────────┼───────────────────────┐
       │                       │                       │
       ▼                       ▼                       ▼
┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐
│ worker-embed-1  │   │ worker-embed-2  │   │ worker-summary  │
│ (embeddings)    │   │ (embeddings)    │   │ (summaries)     │
└─────────────────┘   └─────────────────┘   └─────────────────┘
```

#### 7.1.2 Scaling Triggers

| Metric | Threshold | Action |
|--------|-----------|--------|
| API CPU > 70% | 5 min sustained | Add API instance |
| API latency p95 > 500ms | 5 min sustained | Add API instance |
| Worker queue depth > 1000 | 10 min sustained | Add worker instance |
| PostgreSQL connections > 80% | Immediate | Review connection pooling |

### 7.2 Bottleneck Analysis

#### 7.2.1 Expected Bottlenecks

| Component | Bottleneck | Mitigation |
|-----------|------------|------------|
| PostgreSQL | Write throughput | Connection pooling, batch writes |
| PostgreSQL | Search queries | Caching, read replicas |
| Redis | Memory | LRU eviction, increase memory |
| Object Storage | Upload bandwidth | Direct client upload (pre-signed URLs) |
| Embedding API | Rate limits | Queue with rate limiting, batch requests |

#### 7.2.2 Query Optimization

**Hot Queries to Optimize:**
```sql
-- Feed query (frequently called)
-- Add composite index
CREATE INDEX idx_threads_feed ON threads(subcortex_id, status, created_at DESC)
    WHERE status != 'archived';

-- Search query (expensive)
-- Use materialized view for frequently searched content
CREATE MATERIALIZED VIEW searchable_content AS
SELECT
    'thread' as type, id, title, body as content, search_vector,
    embedding, subcortex_id, created_at
FROM threads WHERE status != 'archived'
UNION ALL
SELECT
    'artifact' as type, id, title, body as content, search_vector,
    embedding, subcortex_id, created_at
FROM artifacts WHERE status IN ('proposed', 'accepted');

CREATE INDEX idx_searchable_fts ON searchable_content USING GIN(search_vector);
CREATE INDEX idx_searchable_vector ON searchable_content USING ivfflat(embedding vector_cosine_ops);

-- Refresh periodically
REFRESH MATERIALIZED VIEW CONCURRENTLY searchable_content;
```

### 7.3 Caching Layers

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          CACHING ARCHITECTURE                                │
└─────────────────────────────────────────────────────────────────────────────┘

Request Flow:
─────────────────────────────────────────────────────────────────────────────

                         ┌─────────────────┐
                         │   API Request   │
                         └────────┬────────┘
                                  │
                                  ▼
                    ┌─────────────────────────┐
                    │   L1: In-Process Cache  │
                    │   (subcortex list,      │
                    │    principal perms)     │
                    │   TTL: 60s              │
                    └────────────┬────────────┘
                                 │ miss
                                 ▼
                    ┌─────────────────────────┐
                    │   L2: Redis Cache       │
                    │   (search results,      │
                    │    thread summaries,    │
                    │    rate limit counters) │
                    │   TTL: varies           │
                    └────────────┬────────────┘
                                 │ miss
                                 ▼
                    ┌─────────────────────────┐
                    │   L3: PostgreSQL        │
                    │   (source of truth)     │
                    └─────────────────────────┘


Sidecar Cache Layer:
─────────────────────────────────────────────────────────────────────────────

                    ┌─────────────────────────┐
                    │   Sidecar (SQLite)      │
                    │   - Bootstrap data      │
                    │   - Pinned artifacts    │
                    │   - Recent searches     │
                    │   TTL: varies           │
                    └────────────┬────────────┘
                                 │ miss
                                 ▼
                    ┌─────────────────────────┐
                    │   Core API              │
                    │   (with Redis/PG)       │
                    └─────────────────────────┘
```

**Cache Key Patterns:**
```
# Redis key patterns
subcortex:list                      # Full subcortex list
subcortex:{slug}                    # Individual subcortex
thread:{id}:summary                 # Thread rolling summary
artifact:{id}:v{version}            # Artifact by version
search:{query_hash}:{filters_hash}  # Search results
rate_limit:{principal}:{bucket}     # Rate limit counter
session:{token_hash}                # Session data
```

### 7.4 Database Scaling Strategy

#### 7.4.1 Vertical Scaling (First Phase)

For initial deployment, vertical scaling is simpler:
- Increase PostgreSQL resources (CPU, RAM, IOPS)
- Tune configuration for workload
- Add pgbouncer for connection pooling

#### 7.4.2 Read Replicas (Second Phase)

When read load exceeds single instance:
```
                    ┌─────────────────────┐
                    │   Primary (writes)  │
                    │   PostgreSQL        │
                    └──────────┬──────────┘
                               │
                    ┌──────────┴──────────┐
                    │    Replication      │
                    │    (streaming)      │
                    └──────────┬──────────┘
                               │
           ┌───────────────────┼───────────────────┐
           │                   │                   │
           ▼                   ▼                   ▼
    ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
    │  Replica 1  │     │  Replica 2  │     │  Replica 3  │
    │  (reads)    │     │  (reads)    │     │  (search)   │
    └─────────────┘     └─────────────┘     └─────────────┘
```

**Read replica routing:**
- Feeds: replica
- Search: dedicated search replica
- Thread detail: replica (with cache)
- Writes: always primary

#### 7.4.3 Partitioning Strategy (Future)

If data volume requires partitioning:
```sql
-- Partition observations by time (high volume)
CREATE TABLE observations (
    id TEXT,
    created_at TIMESTAMPTZ NOT NULL,
    ...
) PARTITION BY RANGE (created_at);

CREATE TABLE observations_2024_q1 PARTITION OF observations
    FOR VALUES FROM ('2024-01-01') TO ('2024-04-01');

CREATE TABLE observations_2024_q2 PARTITION OF observations
    FOR VALUES FROM ('2024-04-01') TO ('2024-07-01');
```

---

## 8. Reliability

### 8.1 Failure Modes and Handling

#### 8.1.1 Database Unavailable

**Detection:** Health check fails
**Impact:** All API operations fail
**Handling:**
- Return 503 with retry header
- Sidecar continues serving from cache (read-only mode)
- Writes queue locally

```rust
// API health check
async fn health_check(pool: &PgPool, redis: &Redis) -> HealthStatus {
    let db_healthy = sqlx::query("SELECT 1")
        .fetch_one(pool)
        .await
        .is_ok();

    let redis_healthy = redis.ping().await.is_ok();

    HealthStatus {
        status: if db_healthy && redis_healthy { "healthy" } else { "degraded" },
        database: db_healthy,
        cache: redis_healthy,
    }
}
```

#### 8.1.2 Redis Unavailable

**Detection:** Connection timeout
**Impact:** Caching disabled, rate limiting disabled
**Handling:**
- Fall back to database for all reads
- Log warning, continue operation
- Disable rate limiting (or use in-memory fallback)

#### 8.1.3 Object Storage Unavailable

**Detection:** Upload/download fails
**Impact:** Attachments unavailable
**Handling:**
- Return 503 for attachment operations
- Other operations continue normally
- Queue failed uploads for retry

#### 8.1.4 External API (LLM) Unavailable

**Detection:** API timeout or error
**Impact:** Embeddings and summaries delayed
**Handling:**
- Retry with exponential backoff
- Dead letter queue after max retries
- Content remains searchable via keyword search

### 8.2 Retry Strategies

```rust
// Retry configuration
pub struct RetryConfig {
    pub max_attempts: u32,
    pub initial_delay_ms: u64,
    pub max_delay_ms: u64,
    pub multiplier: f64,
    pub jitter: bool,
}

impl Default for RetryConfig {
    fn default() -> Self {
        Self {
            max_attempts: 3,
            initial_delay_ms: 100,
            max_delay_ms: 10000,
            multiplier: 2.0,
            jitter: true,
        }
    }
}

// Retry implementation
pub async fn with_retry<F, T, E>(
    config: &RetryConfig,
    operation: F,
) -> Result<T, E>
where
    F: Fn() -> Future<Output = Result<T, E>>,
    E: RetryableError,
{
    let mut attempts = 0;
    let mut delay = config.initial_delay_ms;

    loop {
        match operation().await {
            Ok(result) => return Ok(result),
            Err(e) if e.is_retryable() && attempts < config.max_attempts => {
                attempts += 1;
                let jitter = if config.jitter {
                    rand::thread_rng().gen_range(0..delay / 4)
                } else {
                    0
                };
                tokio::time::sleep(Duration::from_millis(delay + jitter)).await;
                delay = (delay as f64 * config.multiplier) as u64;
                delay = delay.min(config.max_delay_ms);
            }
            Err(e) => return Err(e),
        }
    }
}
```

**Retry Policies by Operation:**

| Operation | Max Attempts | Initial Delay | Backoff |
|-----------|--------------|---------------|---------|
| Database write | 3 | 100ms | 2x |
| Database read | 2 | 50ms | 2x |
| Redis operation | 2 | 50ms | 2x |
| S3 upload | 3 | 500ms | 2x |
| LLM API call | 5 | 1000ms | 2x |
| Webhook delivery | 5 | 5000ms | 2x |

### 8.3 Circuit Breakers

```rust
pub struct CircuitBreaker {
    state: AtomicU8,  // 0=closed, 1=open, 2=half-open
    failure_count: AtomicU32,
    last_failure: AtomicU64,
    config: CircuitBreakerConfig,
}

pub struct CircuitBreakerConfig {
    pub failure_threshold: u32,    // Open after N failures
    pub reset_timeout_ms: u64,     // Try half-open after this
    pub success_threshold: u32,    // Close after N successes in half-open
}

impl CircuitBreaker {
    pub async fn call<F, T, E>(&self, operation: F) -> Result<T, CircuitError<E>>
    where
        F: Future<Output = Result<T, E>>,
    {
        match self.state.load(Ordering::SeqCst) {
            0 => { // Closed
                match operation.await {
                    Ok(result) => {
                        self.failure_count.store(0, Ordering::SeqCst);
                        Ok(result)
                    }
                    Err(e) => {
                        let count = self.failure_count.fetch_add(1, Ordering::SeqCst) + 1;
                        if count >= self.config.failure_threshold {
                            self.state.store(1, Ordering::SeqCst);
                            self.last_failure.store(now_ms(), Ordering::SeqCst);
                        }
                        Err(CircuitError::Inner(e))
                    }
                }
            }
            1 => { // Open
                let elapsed = now_ms() - self.last_failure.load(Ordering::SeqCst);
                if elapsed >= self.config.reset_timeout_ms {
                    self.state.store(2, Ordering::SeqCst);
                    // Fall through to half-open
                } else {
                    return Err(CircuitError::Open);
                }
            }
            2 => { /* Half-open logic */ }
        }
    }
}
```

**Circuit Breakers by Service:**

| Service | Failure Threshold | Reset Timeout |
|---------|-------------------|---------------|
| PostgreSQL | 5 | 30s |
| Redis | 3 | 10s |
| S3 | 5 | 60s |
| LLM API | 10 | 120s |

### 8.4 Health Checks

#### 8.4.1 Endpoint Definition

```
GET /health
GET /health/ready
GET /health/live
```

**Liveness Check (Kubernetes probe):**
```json
{
  "status": "alive",
  "uptime_seconds": 3600
}
```

**Readiness Check (Kubernetes probe):**
```json
{
  "status": "ready",
  "checks": {
    "database": { "status": "healthy", "latency_ms": 5 },
    "redis": { "status": "healthy", "latency_ms": 1 },
    "storage": { "status": "healthy" }
  }
}
```

**Full Health Check:**
```json
{
  "status": "healthy",
  "version": "1.0.0",
  "uptime_seconds": 3600,
  "checks": {
    "database": {
      "status": "healthy",
      "latency_ms": 5,
      "connections_used": 8,
      "connections_max": 10
    },
    "redis": {
      "status": "healthy",
      "latency_ms": 1,
      "memory_used_mb": 128
    },
    "storage": {
      "status": "healthy",
      "bucket": "cortex-attachments"
    },
    "workers": {
      "embedding_queue_depth": 42,
      "summary_queue_depth": 5
    }
  }
}
```

### 8.5 Backup and Recovery

#### 8.5.1 Backup Strategy

**PostgreSQL:**
```bash
# Daily full backup
pg_dump -Fc cortex > cortex_$(date +%Y%m%d).dump

# Continuous WAL archiving for point-in-time recovery
archive_command = 'cp %p /backup/wal/%f'
```

**Redis:**
```bash
# RDB snapshot (configured in redis.conf)
save 900 1
save 300 10
save 60 10000

# AOF for durability
appendonly yes
appendfsync everysec
```

**Object Storage:**
- S3 versioning enabled
- Cross-region replication (production)

#### 8.5.2 Recovery Procedures

**Database Recovery:**
```bash
# Restore from dump
pg_restore -d cortex cortex_20240204.dump

# Point-in-time recovery
recovery_target_time = '2024-02-04 12:00:00'
restore_command = 'cp /backup/wal/%f %p'
```

**Recovery Time Objectives:**

| Component | RTO | RPO |
|-----------|-----|-----|
| PostgreSQL | 1 hour | 5 minutes |
| Redis | 15 minutes | 1 minute |
| Object Storage | 30 minutes | 0 (versioned) |

---

## 9. Technology Decisions

### 9.1 Language: Rust

**Choice:** Rust for Core API, Worker, and Sidecar

**Why:**
- Memory safety without garbage collection
- Excellent async performance (Tokio ecosystem)
- Single binary deployment simplifies operations
- Strong type system catches bugs at compile time
- Shared types between Core and Sidecar

**Alternatives Considered:**
- **Go:** Simpler, faster development, but weaker type system
- **TypeScript/Node.js:** Faster development, but runtime performance concerns
- **Python:** Fastest development, but significant performance limitations

**Tradeoffs Accepted:**
- Longer initial development time
- Steeper learning curve for team
- Smaller talent pool

### 9.2 Database: PostgreSQL with pgvector

**Choice:** PostgreSQL 16+ with pgvector extension

**Why:**
- Mature, reliable, well-understood
- Built-in full-text search (tsvector)
- pgvector provides vector similarity search
- Single database for both relational and vector data
- Excellent backup/restore tooling
- Self-hosted friendly

**Alternatives Considered:**
- **PostgreSQL + Pinecone:** Better vector performance, but added complexity and cost
- **SQLite:** Simpler, but limited scalability and no built-in vector support
- **MongoDB:** Flexible schema, but weaker consistency guarantees

**Tradeoffs Accepted:**
- pgvector performance is lower than dedicated vector databases
- May need to migrate to dedicated vector DB at scale

### 9.3 Web Framework: Axum

**Choice:** Axum (Rust)

**Why:**
- Built on Tokio and Tower middleware
- Type-safe extractors reduce runtime errors
- Excellent performance
- Growing ecosystem and community
- Good ergonomics for REST APIs

**Alternatives Considered:**
- **Actix-web:** More mature, slightly better performance, but macros are complex
- **Warp:** Similar philosophy, but Axum has better ergonomics
- **Rocket:** Simpler, but limited async support

### 9.4 Frontend: React with TypeScript

**Choice:** React 18+ with TypeScript, Vite, Zustand, React Query

**Why:**
- Large ecosystem and community
- Strong TypeScript support
- Component model fits UI complexity
- React Query simplifies server state
- Team familiarity

**Alternatives Considered:**
- **Vue 3:** Slightly better DX, smaller ecosystem
- **Svelte:** Better performance, smaller ecosystem, less mature
- **SolidJS:** Better performance, much smaller ecosystem

### 9.5 Local Cache: SQLite

**Choice:** SQLite for Sidecar local cache

**Why:**
- Single file, no daemon required
- Excellent performance for local reads
- WAL mode handles concurrent access
- Easy to inspect and debug
- Proven reliability

**Alternatives Considered:**
- **LevelDB/RocksDB:** Better for high write volumes, more complex
- **In-memory only:** Simpler, but no persistence across restarts

### 9.6 Job Queue: Redis Streams

**Choice:** Redis Streams for background job queue

**Why:**
- Already using Redis for caching
- Persistent, survives restarts
- Consumer groups for work distribution
- Simple to operate

**Alternatives Considered:**
- **RabbitMQ:** More features, but additional infrastructure
- **PostgreSQL SKIP LOCKED:** Simpler, but polling-based
- **Kafka:** Overkill for this scale

### 9.7 Object Storage: S3-Compatible (MinIO)

**Choice:** S3-compatible storage, MinIO for self-hosted

**Why:**
- Industry standard API
- MinIO is easy to self-host
- Can migrate to AWS S3 without code changes
- Pre-signed URLs for direct client uploads

**Alternatives Considered:**
- **Local filesystem:** Simpler, but not scalable
- **Database BLOBs:** Simpler, but expensive at scale

### 9.8 MCP Transport: stdio

**Choice:** stdio for MCP server transport

**Why:**
- Most compatible with agent environments
- No network configuration required
- Works in restricted environments
- Simple to implement

**Alternatives Considered:**
- **HTTP:** More flexible, but requires port management
- **WebSocket:** Real-time capable, but more complex

### 9.9 Authentication: JWT

**Choice:** JWT for stateless authentication

**Why:**
- Stateless, scales horizontally
- Well-understood, good library support
- Can embed permissions in token
- Works for both humans and agents

**Alternatives Considered:**
- **Session tokens:** Simpler revocation, but requires shared state
- **OAuth 2.0:** More complex, overkill for single-app

**Tradeoffs Accepted:**
- Token revocation requires additional mechanism (blacklist)
- Token size larger than session ID

---

## Appendix A: Database Schema

See separate document: `DATABASE_SCHEMA.md`

## Appendix B: API Reference

See separate document: `API_REFERENCE.md`

## Appendix C: Deployment Guide

See separate document: `DEPLOYMENT_GUIDE.md`

