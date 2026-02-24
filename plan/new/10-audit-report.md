# Cortex Plan Audit Report

> **Date:** 2025-02-04
> **Status:** Complete
> **Result:** Major simplification recommended and implemented

---

## Executive Summary

The Cortex platform plan underwent rigorous multi-perspective auditing. The original specification was comprehensive but over-engineered for the stated MVP use case (solo practitioners and small teams working with AI agents).

### Audit Scope

Five parallel audits were conducted:

1. **Top-Down Coherence Audit** - Does the implementation serve the vision?
2. **Bottom-Up Implementation Audit** - Is every detail actually needed?
3. **Human User Perspective Audit** - Would real users actually use this?
4. **AI Agent Perspective Audit** - Does this help agents be effective?
5. **Efficiency and Simplification Audit** - What can be cut?

### Key Finding

The specification evolved to handle every possible future need instead of ruthlessly focusing on the MVP value proposition. The result was enterprise-grade complexity for a solo-practitioner tool.

---

## Quantitative Summary

| Metric | Before | After | Reduction |
|--------|--------|-------|-----------|
| Entities | 20 | 8 | **60%** |
| API Endpoints | 70+ | ~30 | **55%** |
| Trust Tiers | 5 | 3 | **40%** |
| Services | 5 | 2 | **60%** |
| Spec Lines | ~20,000 | ~8,000 | **60%** |

---

## Major Changes

### 1. Sidecar Eliminated

**Before:** A local daemon (cortexd) with MCP server, SQLite cache, offline queue, hook system, sync engine, and plugin host. ~2000 lines of specification.

**After:** Agents call the REST API directly via MCP tools.

**Rationale:**
- Solves problems (offline support, latency) that may not exist for the target user
- Adds ~40% of total system complexity
- Can be added in v2 if users actually need it

**Trade-off accepted:** No offline support. Slightly higher latency (~50ms vs ~10ms).

### 2. Entities Merged

**Draft merged into Artifact:**
- Before: Separate Draft entity with 7 statuses, 20+ attributes, separate API endpoints
- After: Artifact has status: `draft | proposed | accepted | deprecated`
- Rationale: A draft IS a draft of an artifact. The distinction was artificial.

**Observation merged into Comment:**
- Before: Observation as separate entity (18+ attributes, own table)
- After: Comment with type: `reply | observation | decision | test_result`
- Rationale: Observations without thread context have limited value anyway

**Session eliminated:**
- Before: Session entity tracking agent work sessions
- After: No session tracking
- Rationale: Sessions only made sense with sidecar hooks

**Vote eliminated:**
- Before: Full vote entity with polymorphic targets, aggregation
- After: No voting system
- Rationale: Small teams don't need vote-based ranking

**Subscription simplified:**
- Before: Subscription entity with notification levels, auto-subscription logic
- After: Deferred to v2; basic notifications only
- Rationale: Notification complexity adds little value for small teams

### 3. Trust Tiers Simplified

**Before:** 5 tiers (T0-T4) with nuanced permission differences
- T0: Read-only
- T1: Can create observations/drafts
- T2: Can create threads/comments, propose artifacts
- T3: Can approve drafts, accept artifacts
- T4: Full admin

**After:** 3 tiers
- T0 (Reader): Read and search
- T1 (Contributor): Create content, propose artifacts
- T2 (Admin): Accept artifacts, manage users

**Rationale:** The T2/T3 distinction (can create but not approve) adds complexity without value for small teams where admins do approvals anyway.

### 4. Technology Stack Clarified

**Before:** Contradictory specifications
- Architecture doc: Rust + Axum
- Addendum: Node.js + Fastify for MVP
- Sidecar: Rust

**After:** Node.js only for all components

**Rationale:**
- Faster development velocity
- Larger hiring pool
- Performance is not a concern at MVP scale
- Rust can be added for hot paths after profiling (if ever)

### 5. Infrastructure Simplified

**Before:**
- PostgreSQL (primary database)
- Redis (caching, rate limiting, job queue, sessions)
- Background workers (embeddings, summaries, digests)
- Object storage (attachments)

**After:**
- PostgreSQL only

**Rationale:**
- Postgres handles caching needs (materialized views, query caching)
- Rate limiting: simple in-memory or Postgres-based
- Jobs: synchronous for MVP scale
- Sessions: JWT (stateless)
- Attachments: can use Postgres BYTEA or add S3 when needed

### 6. Terminology Fixed

**Before:** "Subcortex" - confusing neuroscience jargon

**After:** "Topic" - universally understood

**User quote from audit:** "What the hell is a subcortex? Is that like a folder? A channel?"

### 7. Review Workflow Simplified

**Before:** All agent contributions go to draft review queue

**After:** Only artifact proposals need review
- Observations (work exhaust): auto-publish
- Comments: auto-publish
- Threads: auto-publish
- Artifact proposals: require admin approval

**Rationale:** Review queue fatigue identified as #1 adoption killer in human user audit.

---

## Audit Findings by Category

### Top-Down Audit (16 findings)

| Finding | Severity | Resolution |
|---------|----------|------------|
| Trust tier confusion (5 vs 3) | High | Standardized to 3 |
| Sidecar optional vs required | High | Eliminated sidecar |
| Excessive observation types (10) | Medium | Reduced to 4 |
| 70+ API endpoints | High | Reduced to ~30 |
| Workspace complexity vs single-workspace | Medium | Single workspace enforced |
| Rolling summaries unspecified | Medium | Deferred to v2 |
| Plugin system unspecified | Low | Eliminated |
| Sensitivity levels unused | Medium | Eliminated |
| Contradiction detection unspecified | Medium | Deferred to v2 |
| 4 UX personas for 1 primary user | Low | Focused on primary |
| Tech stack contradiction | High | Clarified as Node.js |
| Verification system unclear | Medium | Eliminated |
| Stewards vs owners redundant | Low | Simplified |
| Session entity complex | Medium | Eliminated |
| Attachment system over-specified | Medium | Simplified |
| Evidence requirement friction | Medium | Made optional |

### Bottom-Up Audit (37 findings)

Key findings:
- 10 database schema over-specifications
- 8 unnecessary API endpoints
- 6 excessive configuration options
- 6 over-engineered features
- 7 technical complexity issues

### Human User Audit (15 findings)

Key insights:
1. **Review queue will become guilt-inducing chore** → Auto-approve non-artifacts
2. **Value delayed, cost immediate** → Provide day-1 value
3. **"Subcortex" is confusing** → Renamed to "Topic"
4. **Sidecar is single point of failure** → Eliminated
5. **Evidence requirements block creation** → Made optional
6. **Stop hooks feel like surveillance** → Made opt-in (v2)
7. **Task system duplicates existing tools** → Simplified
8. **Semantic search is the killer feature** → Made search the hero
9. **5pm review ritual won't happen** → Auto-approve low-risk content
10. **Need "what happened while away"** → Dashboard feature (v2)

### Agent Audit (key findings)

Positive:
- Context pack design is good
- Progressive disclosure works well
- Stop hooks concept is right (when implemented)
- Contradiction flagging is valuable

Issues:
- Bootstrap pack too small (4000 chars)
- Missing create_task tool
- Missing duplicate check
- Missing scratchpad/working memory
- Rate limiting could cascade

### Efficiency Audit (major recommendations)

All implemented:
1. ✅ Eliminate sidecar (40% complexity reduction)
2. ✅ Merge Draft into Artifact
3. ✅ Merge Observation into Comment
4. ✅ 3 trust tiers instead of 5
5. ✅ Remove Session entity
6. ✅ Remove Vote entity
7. ✅ Simplify subscriptions
8. ✅ Reduce API to ~30 endpoints
9. ✅ Remove Redis
10. ✅ Remove background workers

---

## Trade-offs Accepted

| Trade-off | What we lose | Why it's acceptable |
|-----------|--------------|---------------------|
| No sidecar | Offline support, local cache | Network is reliable for target users |
| No sessions | Agent session tracking | Can infer from timestamps |
| No votes | Community ranking | Small teams don't need ranking |
| No webhooks | External integrations | Can poll API; add webhooks in v2 |
| No digests | Email summaries | Web UI notifications sufficient |
| No semantic search | AI-powered retrieval | Full-text search works for v1 scale |
| Synchronous ops | Background processing | Acceptable latency at MVP scale |
| Single workspace | Multi-tenancy | v1 is single user/team |

---

## Risk Assessment

### Remaining Risks

1. **Full-text search may be insufficient**
   - Mitigation: Monitor search success rate; add embeddings in v2 if needed

2. **Review queue still exists for artifacts**
   - Mitigation: Keep volume low (only artifact proposals)

3. **No offline support**
   - Mitigation: Target users have reliable connectivity; add sidecar in v2 if needed

4. **Agent latency without sidecar**
   - Mitigation: ~50ms API call is acceptable; optimize if measured as problem

### Risks Eliminated

1. ~~Sidecar complexity and failure modes~~
2. ~~Tech stack confusion~~
3. ~~Review queue overwhelm~~
4. ~~Terminology confusion~~
5. ~~Over-engineering for hypothetical scale~~

---

## Recommendations for Implementation

### Week 1-2: Core Data
1. Set up PostgreSQL with schema from domain model
2. Implement principals (users/agents) with JWT auth
3. Implement topics, threads, comments

### Week 3-4: Knowledge
1. Implement artifacts with status workflow
2. Implement full-text search
3. Basic web UI (search box + results)

### Week 5-6: Agent Integration
1. MCP tools for agent access (8 tools)
2. CLI for manual operations
3. Observation auto-capture

### Week 7-8: Polish
1. Review queue UI
2. Tasks
3. Notifications (mentions only)
4. Documentation

### v2 Backlog (Based on User Feedback)
- Semantic search (embeddings)
- Sidecar with offline support
- Multiple workspaces
- Email digests
- Contradiction detection
- Rolling summaries

---

## Conclusion

The original Cortex specification was well-intentioned but over-engineered. By applying first-principles thinking from human and agent perspectives, we identified that 60% of the specification could be cut without losing core value.

The simplified plan:
- **8 entities** instead of 20
- **~30 endpoints** instead of 70+
- **One server, one database** instead of 5 services
- **Node.js only** instead of Rust + Node.js confusion

This is a system that can be built in 8 weeks by a small team and will deliver immediate value to users. Enterprise features can be added based on actual user feedback rather than anticipated requirements.

---

*Audit conducted: 2025-02-04*
*Auditors: Multi-agent analysis (top-down, bottom-up, human perspective, agent perspective, efficiency)*
