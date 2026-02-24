# Cortex Platform - Development Plan

> **Version:** 2.1 (Post-Audit Simplification)
> **Last Updated:** 2025-02-04
> **Status:** Ready for Implementation

---

## What is Cortex?

**A searchable knowledge base that grows automatically from human-AI collaboration.**

That's it. Not an enterprise CMS. Not a social platform. A searchable knowledge base.

---

## The Simplification

This plan underwent rigorous multi-perspective auditing:
- **Top-down audit**: Does the implementation serve the vision?
- **Bottom-up audit**: Is every detail actually needed?
- **Human user audit**: Would real users actually use this?
- **Agent audit**: Does this help agents be more effective?
- **Efficiency audit**: What can be cut without losing value?

### Key Changes After Audit

| Before | After | Why |
|--------|-------|-----|
| 20 entities | **8 entities** | Most were over-engineering |
| 70+ API endpoints | **~30 endpoints** | CRUD for 8 entities + search |
| 5 trust tiers | **3 tiers** | Reader, Contributor, Admin |
| Sidecar required | **No sidecar** | Agents call API directly |
| Redis + Workers | **Postgres only** | Single database, synchronous ops |
| Rust + Node.js confusion | **Node.js only** | One stack, faster iteration |
| "Subcortex" | **"Topic"** | Clear terminology |
| Draft entity | **Artifact with status** | Merged (draft is just a status) |
| Observation entity | **Comment with type** | Merged (observation is a comment type) |

### What Got Cut

- ❌ Sidecar daemon (agents call API directly)
- ❌ Offline support (require connectivity)
- ❌ Background workers (synchronous for MVP)
- ❌ Redis (Postgres handles everything)
- ❌ Sessions (no sidecar = no sessions)
- ❌ Votes (not needed at small scale)
- ❌ Subscriptions (simple notifications only)
- ❌ Webhooks (defer to v2)
- ❌ Rolling summaries (manual for v1)
- ❌ Contradiction detection (manual flagging)

---

## Architecture (Simplified)

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENTS                                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │   Web UI    │  │    CLI      │  │  AI Agents  │              │
│  │   (React)   │  │             │  │ (MCP/REST)  │              │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘              │
└─────────┼────────────────┼────────────────┼─────────────────────┘
          │                │                │
          └────────────────┼────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                      API SERVER                                  │
│                   (Node.js + Fastify)                            │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  REST API (~30 endpoints)  │  MCP Tool Handler             │ │
│  └────────────────────────────────────────────────────────────┘ │
│                           │                                      │
│                           ▼                                      │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                    PostgreSQL 16                           │ │
│  │         (data + full-text search + auth)                   │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

**One server. One database. That's it.**

---

## Document Index

| # | Document | Purpose | Status |
|---|----------|---------|--------|
| 00 | README (this file) | Overview and navigation | ✅ Updated |
| 01 | [Vision and First Principles](01-vision-and-first-principles.md) | WHO/WHAT/WHY, principles | ✅ Updated |
| 02 | [Domain Model](02-domain-model.md) | 8 entities, PostgreSQL DDL | ✅ Updated |
| 03 | [System Architecture](03-system-architecture.md) | Components, API design | 🔄 Needs update |
| 04 | [API Specification](api-spec/00-index.md) | ~30 REST endpoints | 🔄 Needs update |
| 05 | [MCP Tools](05-mcp-tools-and-cli.md) | Agent interface | 🔄 Needs update |
| 06 | [User Experience](06-user-experience.md) | UI/UX specification | 🔄 Needs update |
| 07 | [Security](07-security-and-governance.md) | Auth, permissions | 🔄 Needs update |
| 08 | [Operations](08-operations-and-deployment.md) | Deployment, monitoring | 🔄 Needs update |
| 09 | [Addendum](09-implementation-addendum.md) | Clarifications, decisions | ✅ Updated |
| 10 | [Audit Report](10-audit-report.md) | What changed and why | 📝 New |

---

## Core Concepts

### Entities (8 total)

| Entity | Purpose |
|--------|---------|
| **Principal** | Users and AI agents |
| **Workspace** | Container (single workspace for v1) |
| **Topic** | Category for organization |
| **Thread** | Discussion container |
| **Comment** | Content in threads (includes observations) |
| **Artifact** | Canonical knowledge (includes drafts as status) |
| **Task** | Work tracking |
| **AuditLog** | Change history |

### The Knowledge Flow

```
Agent does work
       │
       ▼
Comment (type: observation)  ──auto-publish──→  Searchable
       │
       │ Human notices something important
       ▼
Artifact (status: proposed)  ──needs review──→  Review Queue
       │
       │ Admin approves
       ▼
Artifact (status: accepted)  ──────────────→  Canon (trusted)
```

### Trust Tiers

| Tier | Name | Can do |
|------|------|--------|
| 0 | Reader | Read, search |
| 1 | Contributor | Create comments, threads, propose artifacts |
| 2 | Admin | Accept artifacts, manage users |

---

## Technology Stack

| Component | Choice | Rationale |
|-----------|--------|-----------|
| API | Node.js + Fastify | Fast iteration, good ecosystem |
| Database | PostgreSQL 16 | Reliable, full-text search built-in |
| Web UI | React + TypeScript | Standard, maintainable |
| Auth | JWT | Stateless, simple |
| Search | PostgreSQL tsvector | Good enough for v1 scale |

**What we're NOT using:**
- ❌ Redis (Postgres handles caching needs)
- ❌ Elasticsearch (tsvector is sufficient)
- ❌ Background workers (synchronous operations)
- ❌ Message queues (direct database writes)
- ❌ Rust (Node.js is fast enough)

---

## Success Metrics

### North Star

**Time to find relevant prior work: < 30 seconds**

### Supporting Metrics

| Metric | Target |
|--------|--------|
| Search success rate | 70%+ |
| Agent context hit rate | 40%+ |
| Review queue size | < 10 items |
| Artifact acceptance rate | 80%+ |

---

## Quick Start for Implementers

1. **Read 01-vision** - Understand the problem and principles
2. **Read 02-domain-model** - Understand the data (8 entities)
3. **Implement database** - Use the DDL in 02-domain-model
4. **Build API** - ~30 endpoints, CRUD + search
5. **Build MCP tools** - 8 tools for agent access
6. **Build UI** - Search-first, review queue, browse

### MVP Scope (Week 1-4)

1. Database schema + migrations
2. Auth (principals, JWT, API keys)
3. CRUD for topics, threads, comments
4. CRUD for artifacts (with status workflow)
5. Full-text search
6. Basic web UI (search + browse)

### Extended Scope (Week 5-8)

1. MCP tool integration
2. Tasks
3. Review queue UI
4. Notifications (mentions only)
5. CLI tool

---

## What's Deferred to v2

- Semantic search (embeddings)
- Multiple workspaces
- Team management
- Email digests
- Offline support
- Sidecar daemon
- Contradiction detection
- Rolling summaries

---

## Principles (Non-Negotiable)

1. **Search is the product** - Landing page is a search box
2. **Invisible capture** - Agents create observations automatically
3. **Review proportional to risk** - Only artifacts need approval
4. **Graceful degradation** - Works even without curation
5. **Immediate value** - Useful from day 1, not month 3

---

*Total specification: ~8,000 lines across 10 documents (reduced from ~20,000 lines across 20 documents)*
