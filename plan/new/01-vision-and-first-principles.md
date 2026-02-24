# Cortex: Vision and First Principles

> **Version:** 2.1 (Simplified)
> **Status:** Authoritative

---

## Executive Summary

**Cortex is a searchable knowledge base that grows automatically from human-AI collaboration.**

That's it. Not a content management system. Not a social platform. Not a project management tool. A searchable knowledge base that captures what you learn and surfaces it when you need it.

---

## 1. The Problem

### What Happens Today

When you work with an AI agent (Claude Code, Cursor, ChatGPT), you produce valuable outputs:
- Discoveries ("ah, this API requires UTC timestamps")
- Decisions ("we chose Postgres over MongoDB because...")
- Solutions ("the fix was to add a retry with backoff")
- Context ("this module handles authentication")

**90% of this is lost within 24 hours.**

It lives in chat logs that are never searched, local files that are never shared, or your memory that eventually fades.

### The Consequences

1. **Duplicate Work**: You solve the same problem twice because you forgot you solved it
2. **Lost Context**: New team members start from zero
3. **Agent Amnesia**: Every AI session starts fresh, relearning what you already know
4. **Knowledge Decay**: Good decisions are forgotten; bad patterns return

### Who Feels This Pain

**Primary User: The Solo Practitioner**

- Works with AI agents 4+ hours daily
- Manages multiple projects
- Has no time for "knowledge management"
- Needs tools that work invisibly

This is who we build for. Not enterprises. Not teams of 50. One person who wants their AI agents to get smarter over time.

---

## 2. The Solution

### Core Insight

The best knowledge management requires no management. It should:
1. **Capture automatically** - No manual logging
2. **Surface proactively** - No manual searching (usually)
3. **Stay accurate** - No stale information

### What Cortex Does

1. **Captures**: AI agents automatically record discoveries, decisions, and context
2. **Organizes**: Content flows into topics without manual filing
3. **Surfaces**: When you or your agent needs information, search finds it
4. **Curates**: Important knowledge gets promoted to "canon" with human review

### What Cortex Does NOT Do

- ❌ Replace your project management tool (use Linear, Jira, GitHub Issues)
- ❌ Replace your documentation (use Notion, Confluence, README files)
- ❌ Execute code or run agents (use Claude Code, Cursor, etc.)
- ❌ Provide a social feed or activity stream
- ❌ Require daily maintenance or review rituals

---

## 3. Core Concepts

### The Knowledge Hierarchy

```
Comments (Exhaust)     →    Artifacts (Canon)
   │                            │
   │ Automatic capture          │ Human-approved
   │ High volume                │ Low volume
   │ May be wrong               │ Should be correct
   │ Searchable                 │ Searchable + Trusted
   │                            │
   └──── Review Gate ───────────┘
```

**Comments** (including observations): Raw work output. Created automatically. Searchable but not authoritative.

**Artifacts**: Curated knowledge. Requires human approval. The "source of truth."

### The Review Gate

Not everything needs review. The rule is simple:

| Content Type | Auto-publish? | Why |
|-------------|---------------|-----|
| Observations (work exhaust) | ✅ Yes | Low risk, high volume |
| Comments on threads | ✅ Yes | Low risk, conversational |
| New threads | ✅ Yes | Low risk, starts discussion |
| Artifact proposals | ❌ No | High impact, needs verification |

This means your review queue is **artifact proposals only** - typically 1-5 per day, not 50.

### Topics (Organizational Containers)

Topics are broad categories. You should have 3-10, not 30.

Examples:
- `architecture` - System design decisions
- `operations` - How to deploy and run things
- `domain` - Business logic and rules
- `incidents` - What went wrong and why

Topics are NOT:
- Per-project folders
- Per-feature folders
- A deep hierarchy

When in doubt, use fewer topics. Search handles the rest.

---

## 4. User Personas

### Primary: The Solo Practitioner ("Alex")

**Who they are:**
- Senior developer or technical founder
- Uses AI agents (Claude Code, Cursor) daily
- Works across 2-5 active projects
- Values speed over process

**What they want:**
- "My AI agents should remember what we learned"
- "I should find things faster than re-asking"
- "It should work without me thinking about it"

**What they hate:**
- Daily review queues
- Complex categorization
- Another tool to maintain
- Anything that interrupts flow

**Success looks like:**
- Agent finds relevant prior work in first response
- Search returns useful results in <30 seconds
- System runs for weeks without manual intervention

### Secondary: The Team Lead ("Jordan")

**Who they are:**
- Manages 3-5 developers
- Reviews PRs and architectural decisions
- Wants team knowledge to persist

**What they want:**
- "New hires should learn from past decisions"
- "I shouldn't explain the same thing twice"
- "Important decisions should be recorded"

**What they hate:**
- Being the knowledge bottleneck
- Outdated documentation
- Knowledge silos

---

## 5. Design Principles

### 1. Search is the Product

The landing page is a search box. Everything else is secondary.

If search works well, users find value. If search fails, nothing else matters.

### 2. Invisible Capture

Users should never think about capturing knowledge. Agents record observations automatically. Stop hooks fire without intervention. The system fills itself.

### 3. Review Proportional to Risk

High-volume, low-risk content auto-publishes. Low-volume, high-risk content needs review. The review queue should average 1-5 items per day, not 50.

### 4. Graceful Degradation

If users never review artifacts, the system still works. Observations remain searchable. Knowledge accumulates even without curation. Curation makes it better, but isn't required.

### 5. Immediate Value

Day 1: Search your agents' recent observations
Week 1: Find something useful you'd forgotten
Month 1: Agent context includes prior discoveries

Don't require months of use before value appears.

### 6. Minimum Viable Metadata

Every field we add is a field users must understand, agents must populate, and we must maintain. Add fields only when their absence causes real problems.

---

## 6. Success Metrics

### North Star Metric

**Time to find relevant prior work: < 30 seconds**

If users can find what they need in 30 seconds, the system works.

### Supporting Metrics

| Metric | Week 1 | Month 1 | Month 6 |
|--------|--------|---------|---------|
| Observations captured | 50+ | 500+ | 5000+ |
| Artifacts created | 1+ | 10+ | 50+ |
| Searches per day | 5+ | 10+ | 20+ |
| Search success rate | 50% | 70% | 80% |
| Agent context hit rate | 20% | 40% | 60% |

### Anti-Metrics (Don't Optimize)

- Review queue size (lower isn't always better)
- Time spent in Cortex UI (less is more)
- Number of topics (fewer is better)
- Daily active usage (weekly is fine)

---

## 7. What We're NOT Building (v1)

### Deferred to v2+

- **Sidecar daemon**: Agents call API directly for MVP
- **Offline support**: Require network connectivity
- **Team features**: Multi-workspace, roles beyond 3 tiers
- **Notifications**: Beyond basic mentions
- **Digests**: Email summaries
- **Contradiction detection**: Manual flagging only
- **Rolling summaries**: Manual summaries only
- **Plugins**: Direct integrations only

### Probably Never

- **Public sharing**: This is internal knowledge
- **Social features**: Likes, follows, activity feeds
- **Mobile app**: Web is sufficient
- **AI-powered auto-curation**: Humans approve artifacts

---

## 8. Technical Constraints

### Simplicity Requirements

- **Single service**: API server only (no sidecar, no workers)
- **Single database**: PostgreSQL only (no Redis, no search cluster)
- **Single language**: TypeScript/Node.js
- **Stateless**: JWT auth, no server sessions

### Scale Targets (v1)

- 1-10 users per workspace
- 10,000 observations per workspace
- 500 artifacts per workspace
- 100 searches per day

This is not enterprise scale. It's "small team or solo" scale. Build for that.

---

## 9. Open Questions

These are deliberately unresolved for v1:

1. **How do agents get context?** MCP tools calling REST API directly. Is latency acceptable?
2. **How do we handle secrets in observations?** Block on detection, allow user override?
3. **What happens when artifacts conflict?** Manual flagging, no auto-detection?
4. **How do users fix wrong artifacts?** Edit in place with history, or supersede?

We'll learn the answers from actual usage.

---

## Appendix: Glossary

| Term | Definition |
|------|------------|
| **Artifact** | A piece of canonical knowledge that has been reviewed and accepted |
| **Comment** | A piece of content in a thread (can be a reply, observation, or decision) |
| **Observation** | A comment of type "observation" - work exhaust captured automatically |
| **Principal** | An authenticated user or agent |
| **Topic** | A category for organizing threads and artifacts (formerly "Subcortex") |
| **Thread** | A discussion container holding comments |
| **Workspace** | The container for all content (single workspace for v1) |

---

*This document is the authoritative source for Cortex vision and principles. All other documents must align with this.*
