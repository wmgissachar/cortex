# Cortex Roadmap: Feature Plan and Long-Term Vision

> Created: February 8, 2026
> Grounded in: `docs/first-principles.md` (21 principles)
> Informed by: `docs/audit-and-fixes.md` (current state assessment)

---

## Vision

Cortex today is a knowledge store — it captures and retrieves. Cortex should become a **cognitive partner** — it understands what you need, connects what you know, and surfaces what you've forgotten. The gap between these two states defines the roadmap.

The trajectory:
1. **Store** (current) → knowledge goes in, knowledge comes out on request
2. **Organize** (near-term) → knowledge is structured, connected, and lifecycle-managed
3. **Surface** (mid-term) → knowledge flows to where it's needed without being asked
4. **Synthesize** (long-term) → knowledge generates new understanding from what's accumulated

---

## Feature Analysis: Human Needs vs. Agent Needs

### Features Primarily for Humans

These features serve the human's role as editor, curator, and decision-maker. They address principles H1-H7.

#### H-1: Dashboard with Situational Awareness
**What:** A dedicated dashboard page that answers "what happened since I last looked?" Grouped by: completed sessions, new artifacts, updated tasks, items needing attention.

**Justification (H1, H4, H6):** The human's most critical interaction with Cortex is the return after absence. Currently, they must reconstruct the narrative manually from activity feeds and thread lists. A dashboard pre-computes the situational picture, spending the human's attention budget wisely. This is the single highest-leverage UI feature for the human experience.

**Design notes:**
- Track `last_seen_at` per principal — note: `last_active_at` already exists on principals but is updated by API-key auth (agent calls), not JWT auth (human web sessions). A new `last_seen_at` column is needed specifically for human web visits, updated in the JWT auth middleware path.
- Show "since your last visit" by default, with date range selector
- Group content by research program / topic, not just chronologically
- Highlight action items: tasks assigned, artifacts pending review, threads with questions
- Show knowledge base health metrics: total artifacts, deprecated count, unreviewed count

---

#### H-2: Content Creation and Editing Suite
**What:** Full CRUD forms in the web UI for threads, artifacts, tasks, and topics. Inline editing for existing content. Deprecation and archival actions.

**Justification (H3, Pillar 5):** The human is locked out of authorship and curation. The UI has React Query mutation hooks for every write operation but no forms connected to them. This is the most fundamental gap — the human cannot participate in the system they're supposed to direct.

**Components:**
- Thread creation form (topic, title, type, body, tags)
- Artifact creation/edit form with markdown preview (title, type, body, summary, tags, references)
- Task creation/edit form (title, body, priority, due date, assignee, topic, thread)
- Inline editing for thread titles, task details
- Deprecate artifact action (with optional supersession link)
- Archive/resolve thread action
- Topic editing (description, icon)

---

#### H-3: Curation Tools
**What:** Batch operations and gardening tools for maintaining knowledge base health.

**Justification (H3, Pillar 4, H6):** Curation must be cheaper than creation. If it takes 30 seconds to write an observation but 10 minutes to clean up the knowledge base, the knowledge base will rot. The human needs fast, low-friction tools for the four curation operations: triage, organization, distillation, and deprecation.

**Components:**
- Batch thread resolution (select multiple, resolve all)
- Batch tag editing (normalize tags across threads/artifacts)
- "Knowledge base health" view: stale artifacts, unresolved threads, orphaned tasks
- Thread merge capability (combine related threads into one)
- Quick deprecation with supersession linking
- "Unreviewed artifacts" filter (artifacts the human hasn't opened)

---

#### H-4: Notification and Attention System
**What:** Priority-based notification system that distinguishes "act on this" from "FYI" from "background."

**Justification (H2, H6):** The human's attention is the scarcest resource. Currently, everything is presented with equal weight. A notification system that pre-triages information by importance transforms the human's experience from "scan everything" to "act on what matters."

**Design notes:**
- Action required: new tasks assigned, artifacts pending review, threads with @mentions or questions
- FYI: completed agent sessions, new artifacts, resolved threads
- Background: routine checkpoints, observation updates
- Delivery channels: in-app badge counts (initially), email digest (later)
- User-configurable sensitivity per topic

---

#### H-5: Research Program Views
**What:** Aggregate view that groups related threads, artifacts, and tasks into a coherent research program narrative.

**Justification (Pillar 7, H7, H1):** The cold-start embedding research spans 10+ threads, 4+ artifacts, and multiple tasks. Today, these are scattered across the thread and artifact lists with no structural connection. A research program view collects all related work into a single navigable timeline, letting the human see the full arc of a research program.

**Design notes:**
- Manual grouping: human assigns threads/artifacts to a "program" (new entity or tag-based)
- Timeline view: chronological display of all activity within the program
- Summary: auto-generated or human-curated program status ("active," "completed," "paused")
- Key metrics: observation count, artifact count, date range, last activity

---

### Features Primarily for Agents

These features serve the agent's role as primary author and amnesiac reasoner. They address principles A1-A7.

#### A-1: Task-Scoped Briefings
**What:** A `cortex_get_briefing` tool that accepts a topic_id or task description and returns a narrative briefing tailored to the agent's upcoming work.

**Justification (A1, A5):** The current cortex_get_context returns a generic directory. An agent continuing cold-start research gets the same overview as one starting fresh on an unrelated topic. Task-scoped briefings reduce orientation cost from 5,000-15,000 tokens (5-10 tool calls) to 2,000-4,000 tokens (1-2 calls).

**Design notes:**
- Input: topic_id (optional), keywords (optional), budget
- Output: narrative summary of relevant state — active threads, recent decisions, key artifacts, open tasks, glossary terms, recent negative results
- Should include thread IDs that the agent will need for observations
- Prioritize recent decisions and active work over historical context

---

#### A-2: Compaction-Resilient State Management
**What:** System-level persistence of active session state (current thread ID, task IDs, working context) that survives context compaction.

**Justification (A2):** Agents lose thread IDs after context compaction and sometimes hallucinate UUIDs. The current mitigation (error recovery instructions) is reactive. Proactive state persistence prevents the problem entirely.

**Design notes:**
- **Option 1 (Phase 0 — immediate):** Include active thread_id in every MCP tool response footer ("Active thread: {id}"). This is a ~1-line change per tool and directly prevents the most common failure. Moved to Phase 0 in the audit fixes.
- Option 2: Environment variable injection for session thread (CORTEX_CHECKPOINT_THREAD_ID already exists, extend this pattern)
- Option 3: `cortex_get_session_state` tool that returns the agent's most recent checkpoint with all IDs
- Options 2 and 3 are Phase 2 enhancements building on the Phase 0 foundation

---

#### A-3: Structured Observation Types
**What:** Differentiate between observation types with metadata: result, decision, negative result, methodology note, question, checkpoint.

**Justification (A3, A4, Pillar 3):** Currently, all observations are type "observation" with no structured differentiation. A checkpoint about routine progress looks identical to a research result that changes the project direction. Structured types enable filtering, prioritization, and lifecycle management.

**Documentation tax consideration:** This feature adds a new decision (observation type selection) to every agent write. To minimize friction: provide a sensible default (`observation`), make the type optional, and limit to 4-5 choices. The agent already writes substantive observations — categorizing them adds ~50 tokens per call, which is acceptable given the filtering and surfacing value gained.

**Design notes:**
- Extend comment types or add structured metadata (JSON) to observations
- Key types: `result` (experimental outcome with metrics), `decision` (choice made with rationale), `negative_result` (tried and failed with reason), `question` (open question for human), `checkpoint` (routine progress)
- Display differently in UI (color-coded, filterable)
- Enable search by observation type ("show me all negative results for cold-start")
- Effort is Medium (not Low) — requires schema migration, MCP tool changes, API changes, UI rendering changes, and CLAUDE.md updates across all four packages

---

#### A-4: Negative Knowledge Registry
**What:** First-class representation of failed approaches — what was tried, why it failed, and when to revisit.

**Justification (A4, Pillar 7):** Negative knowledge is arguably the most valuable output of research teams, yet it has no structural representation. It prevents the most common form of wasted effort: re-exploring dead ends. The cold-start research alone has multiple methods that were tried and failed (Ridge reconstruction, coherent barycenter, various aggregation approaches). A future agent should be warned before attempting them again.

**Design notes:**
- Could be an observation type (`negative_result`) with structured fields: method tried, conditions, result, why it failed, when to revisit
- Surface proactively when an agent searches for related terms
- Could be a dedicated artifact type ("dead end" or "negative finding") or a tag-based approach
- Must be searchable and surfaceable, not just buried in thread observations

---

#### A-5: Agent Thread Resolution
**What:** MCP tool for agents to mark their threads as resolved with a final summary.

**Justification (A3, Pillar 4):** Agents create threads but cannot close them. The lifecycle principle requires that knowledge has an end. Giving agents the ability to resolve threads keeps the thread list navigable for both humans and agents, and signals that the work is complete.

**Note:** This feature is delivered in Phase 0 as part of the thread lifecycle fix (audit Fix 2). It appears here for completeness in the feature catalog but is not duplicated in the Phase 1 table.

**Design notes:**
- `cortex_update_thread` tool: id, status (open/resolved/archived)
- CLAUDE.md instruction update: "When your task is complete, post a final summary observation and resolve the thread"
- Resolved threads should remain searchable but be visually distinguished from open threads

---

#### A-6: Smart Observation Deduplication
**What:** Detect and prevent duplicate observations caused by API call retries.

**Justification (A2, Pillar 1):** Agents sometimes think a write failed (due to network issues or bash piping errors) and retry, creating duplicate content. The system should detect near-duplicate observations (same thread, similar body, close timestamps) and either deduplicate automatically or warn the agent.

**Design notes:**
- Server-side: Check for observations with same thread_id and similar body (first 100 chars) within 60 seconds
- If detected: return the existing observation ID instead of creating a duplicate
- Client-side: Idempotency key support (agent sends a unique key per observation, server deduplicates)

---

### Features That Serve Both (Compound Value)

These features are valuable to both humans and agents simultaneously. They represent the highest-priority investments because they compound across both user types.

#### C-1: Knowledge Graph with Explicit Relationships
**What:** Structured relationships between knowledge entities: supersedes, supports, contradicts, depends-on, related-to.

**Justification (Pillar 7, Pillar 3, H5):** This is the feature that transforms Cortex from a document store into an institutional memory. Connections between knowledge are where compounding value lives. When an artifact explicitly supersedes another, future readers (human and agent) are guided to the current truth. When two artifacts are marked as contradicting, the system can flag the conflict for resolution. When one depends on another, deprecating the dependency triggers review of the dependent.

**Implementation:**
- New `knowledge_links` table: source_id, target_id, link_type (supersedes, supports, contradicts, depends_on, related_to), created_by, created_at
- UI: "Related artifacts" section on artifact detail page with relationship type
- MCP: Add `references` parameter to `cortex_draft_artifact` with structured types
- When creating a superseding artifact, auto-deprecate the superseded one
- Surface contradictions prominently to both humans and agents

**Compound value:** Agents creating artifacts can declare relationships (supersedes, supports), enabling automatic lifecycle management. Humans see the knowledge graph in the UI, enabling faster navigation and trust assessment. Both benefit from contradiction detection.

---

#### C-2: Content Summaries and Distillation
**What:** Auto-generated or agent-generated summaries at every level: thread summaries, topic summaries, research program summaries.

**Justification (H1, A1, A5, Pillar 1):** Summaries are the bridge between the agent's detailed documentation and the human's need for quick comprehension. They also reduce agent orientation cost — reading a thread summary (200 tokens) is far cheaper than reading the full thread (3000 tokens).

**Implementation:**
- Thread summary field: auto-populated by the agent at thread resolution, or manually by human
- Topic summary: curated overview of the current state of knowledge in a topic
- Research program summary: synthesized narrative across multiple threads
- `cortex_summarize_thread` MCP tool: agent generates a summary of a thread's key findings
- Display summaries in list views and search results instead of truncated body text

**Compound value:** Humans get the "summary over stream" experience. Agents get cheaper orientation. Both get better search results (summaries are more informative than truncated body text).

---

#### C-3: Confidence and Evidence Metadata
**What:** Structured metadata on artifacts and observations: confidence level, evidence type, methodology classification, known limitations.

**Justification (Pillar 3, H5, A6, A3):** Provenance is non-negotiable, but currently provenance is limited to "who" and "when." Adding "how confident" and "based on what kind of evidence" transforms the trust architecture from binary (trust/don't trust) to calibrated (high confidence based on 36 experiments vs. low confidence preliminary hypothesis).

**Implementation:**
- Add optional `metadata` JSONB field to observations and artifacts
- Structured fields: confidence (high/medium/low), evidence_type (experimental/theoretical/anecdotal), methodology (described/reproducible/verified), limitations (free text)
- Display confidence badges in UI alongside content
- Agents can attach metadata to observations and artifacts via MCP tools
- Enable search/filter by confidence level

**Compound value:** Humans can quickly assess credibility without reading the full content. Agents can weight prior knowledge by confidence when making decisions. Both benefit from the trust calibration.

---

#### C-4: Proactive Context Surfacing
**What:** The system pushes relevant knowledge to agents and humans based on what they're doing, rather than waiting for search queries.

**Justification (Pillar 2, A4, H2):** This is the principle that transforms Cortex from a tool into an extension of cognition. When an agent starts working on aggregation methods and the system surfaces "Note: Ridge reconstruction and coherent barycenter were both tried and degraded performance by 4pp" — that's institutional memory actively preventing wasted effort.

**Implementation (progressive):**
- Phase 1: Topic-scoped briefings (A-1 above) — simplest form of contextual delivery
- Phase 2: Keyword-triggered warnings — when an observation or artifact mentions a term associated with negative results, surface the relevant negative finding
- Phase 3: Semantic similarity — when new content is similar to existing content, surface the related items (requires embedding-based search, a more significant investment)

**Compound value:** Agents avoid re-exploring dead ends. Humans are warned about contradictions. Both benefit from the system actively participating in knowledge delivery rather than passively storing.

---

#### C-5: Enhanced Search with Facets and Filters
**What:** Advanced search with filtering by type, topic, date range, creator, confidence level, status, and tags. Saved searches. Search result ranking with exposed relevance scores.

**Justification (Pillar 1, A5, H6, Pillar 7):** As the knowledge base grows from 17 artifacts to 170+, search quality becomes the primary determinant of whether knowledge compounds or becomes noise. Faceted search lets both humans and agents find precisely what they need.

**Implementation:**
- Add filters to search API: date range, creator kind (human/agent), status, type, tags
- Expose relevance rank in results
- UI: filter sidebar on search results page
- MCP: add filter parameters to `cortex_search` tool
- Saved searches for humans (bookmark common queries)

**Compound value:** Agents find relevant prior work faster (cheaper orientation). Humans find what they need without scrolling through noise. Both benefit from better signal-to-noise ratio as the knowledge base grows.

---

## Phased Roadmap

### Phase 0: Foundation Fixes (Immediate)
*Prerequisite for all subsequent phases. See `audit-and-fixes.md` for full details.*

| Item | Effort | Principles |
|------|--------|------------|
| Batch data cleanup (resolve threads, deprecate stale artifacts, normalize tags) | Low | Pillars 1, 4 |
| Thread lifecycle — UI buttons + `cortex_update_thread` MCP tool (A-5) | Low | Pillars 1, 4; H2, H4; A3 |
| Human editorial tools + creation forms (H-2) | Medium | Pillar 5; H3 |
| Compaction-resilient agent state — ID footers in tool responses (A-2 Option 1) | Low | A2 |
| Knowledge_links table + artifact supersession | Medium | Pillars 3, 4; H5 |
| Enrich cortex_get_context (topic scoping) | Low-Medium | A1, A5 |
| Populate audit logs | Low | Pillar 3; H5 |
| Tag normalization | Low | Pillar 7 |
| Activity feed filtering + pagination + highlights mode | Low | H1, H2, H6 |

**Outcome:** Cortex becomes a functional knowledge management system with proper lifecycle management, human editorial tools, and compaction-resilient agent state. The `knowledge_links` table is introduced here and extended in Phase 1.

> **Note on audit Fix 3 ("Since Last Visit" dashboard):** Deferred to Phase 1 because it benefits from thread resolution data (Phase 0) being available first — the dashboard is more useful when it can distinguish resolved vs. active threads. Requires a new `last_seen_at` column (distinct from existing `last_active_at` which tracks agent API calls, not human web sessions).

---

### Phase 1: Organization and Navigation
*The knowledge base is well-structured, connected, and navigable.*

| Item | Effort | Type | Principles |
|------|--------|------|------------|
| Dashboard with "since last visit" (H-1) | Medium | Human | H1, H4, H6 |
| Knowledge graph — extend knowledge_links with UI + MCP integration (C-1) | Medium | Compound | Pillar 7; H5 |
| Structured observation types (A-3) | Medium | Agent | A3, A4; Pillar 3 |
| Thread summary field — manual, populated by agent at resolution (C-2 part 1) | Low | Compound | H1; A1, A5 |
| Enhanced search with filters (C-5) | Medium | Compound | Pillar 1; A5; H6 |

**Outcome:** Knowledge is connected, summarized, and navigable. Humans have a situational awareness dashboard. Observations are categorized by type. Search returns precise, filterable results.

> **Dependency note:** Contradiction detection (Phase 3) depends on the knowledge graph built here. Thread summaries depend on thread resolution (Phase 0).

---

### Phase 2: Intelligence and Trust
*The system actively helps users find and assess knowledge.*

| Item | Effort | Type | Principles |
|------|--------|------|------------|
| Confidence and evidence metadata (C-3) | Medium | Compound | Pillar 3; H5; A3 |
| Negative knowledge registry (A-4) | Medium | Agent | A4; Pillar 7 |
| Compaction-resilient state — session state tool + env vars (A-2 Options 2-3) | Low | Agent | A2 |
| Observation deduplication (A-6) | Low | Agent | A2; Pillar 1 |
| Curation tools — batch operations (H-3) | Medium | Human | H3; Pillar 4; H6 |
| Task-scoped briefings (A-1) | Medium | Agent | A1; A5 |
| Notification system — in-app (H-4) | Medium | Human | H2; H6 |

**Outcome:** The system provides calibrated trust signals. Agents get tailored briefings. Humans have curation tools and notifications. Failed approaches are tracked and surfaced.

> **Documentation tax note:** C-3 (confidence metadata) and A-4 (negative knowledge) add new optional fields to agent authorship. Both use sensible defaults and optional parameters to minimize the additional documentation burden per A7 and Pillar 6.

---

### Phase 3: Synthesis and Proactivity
*The system generates new understanding from accumulated knowledge.*

| Item | Effort | Type | Principles |
|------|--------|------|------------|
| Keyword-triggered context warnings (C-4 core) | Medium | Compound | Pillar 2; A4; H2 |
| Research program views — entity-based grouping (H-5) | Medium | Human | Pillar 7; H7; H1 |
| Auto-generated topic and thread summaries (C-2 part 2) | Medium | Compound | H1; A1 |
| Contradiction detection — leverages knowledge_links from Phase 1 (C-1 extension) | High | Compound | H5; Pillar 4 |
| Semantic search — embedding-based retrieval (C-5 extension) | High | Compound | Pillar 7; A5 |
| Knowledge staleness detection — flag artifacts not referenced or updated in N months, surface for human review | Medium | Compound | Pillar 4 |

**Outcome:** Cortex becomes a cognitive partner. It proactively surfaces relevant knowledge, detects contradictions, identifies stale content, and synthesizes understanding across the knowledge base. This is the "extension of cognition" threshold.

---

## Feature Justification Matrix

Each feature is justified by the principles it serves and its compound value (how much more valuable it makes other features):

| Feature | Human Value | Agent Value | Compound Effect |
|---------|------------|-------------|-----------------|
| Knowledge graph (C-1) | Navigate connected knowledge | Trust assessment via provenance chains | Enables lifecycle automation, contradiction detection |
| Content summaries (C-2) | Quick comprehension | Cheap orientation | Better search results, faster returns |
| Confidence metadata (C-3) | Credibility assessment at a glance | Weighted prior knowledge | Enables trust calibration across the system |
| Proactive surfacing (C-4) | Warnings and relevant context | Avoid re-exploring dead ends | Transforms Cortex from tool to cognitive partner |
| Enhanced search (C-5) | Precise discovery | Faster orientation | Everything else works better when search is good |
| Dashboard (H-1) | Situational awareness | — | Reduces human's cognitive overhead, enabling scope expansion |
| Content creation (H-2) | Full participation in the system | — | Enables human editorial role described in first principles |
| Curation tools (H-3) | Knowledge base maintenance | — | Prevents decay, maintains trust |
| Notifications (H-4) | Priority-based attention management | — | Reduces attention waste, increases signal-to-noise |
| Research programs (H-5) | Portfolio-level insights | — | Enables H7 (scope expansion) |
| Task-scoped briefings (A-1) | — | Cheap, relevant orientation | Reduces token waste, increases agent productivity |
| Compaction resilience (A-2) | — | Prevents ID hallucination | Reduces error recovery overhead |
| Structured observations (A-3) | Better filtering | Better documentation | Enables A-4 (negative knowledge) |
| Negative knowledge (A-4) | — | Prevents re-exploring dead ends | Directly prevents wasted effort |
| Thread resolution (A-5) | Navigable thread lists | Lifecycle completion | Keeps thread list navigable for everyone |
| Deduplication (A-6) | — | Prevents duplicate content | Maintains data quality |

> **Note on feature identifiers:** Features use the prefix pattern H-x (human), A-x (agent), C-x (compound). Principles use unprefixed H/A numbers. When this document references "H3" (no hyphen) it means the principle; "H-3" (with hyphen) means the feature. Similarly "A2" = principle, "A-2" = feature.

---

## The Compounding Value Principle Applied

Features are not independent — they compound. The highest-priority investments are those that make other features more valuable:

**Search quality compounds everything.** Better search → faster agent orientation → cheaper human review → more content worth creating → more content to search. This is the primary flywheel.

**Knowledge graph compounds trust.** Connected artifacts → visible provenance chains → calibrated trust → more confident decision-making → more decisions worth recording → richer graph.

**Lifecycle management compounds usability.** Resolved threads → cleaner lists → faster navigation → lower cognitive load → more engagement → more lifecycle management.

**Summaries compound across all interactions.** Thread summaries → better search results → cheaper agent orientation → better human dashboard → more threads resolved with summaries.

The roadmap is ordered to build these compounding loops: foundation fixes enable lifecycle management, which enables summaries, which enables better search, which enables proactive surfacing.

---

## What Success Looks Like

### At Phase 0 completion
- The human can create content, resolve threads, and deprecate artifacts through the UI
- Agents can resolve their threads when work is complete
- The thread list distinguishes active from completed work
- cortex_get_context delivers topic-scoped overviews

### At Phase 1 completion
- Artifacts are connected through explicit relationships
- The human has a dashboard showing what happened since they last visited
- Threads have summaries that appear in search results
- Search returns precise, filterable results

### At Phase 2 completion
- Agents get task-scoped briefings in 1-2 tool calls
- Failed approaches are tracked and surfaceable
- The human has batch curation tools and notifications
- Content has confidence metadata enabling trust calibration

### At Phase 3 completion
- Cortex proactively surfaces relevant knowledge when agents start working
- Contradictions between artifacts are automatically detected and flagged
- Research programs are visible as coherent narratives across many sessions
- The human's effective oversight scope has expanded from 3 programs to 10+

This is the "extension of cognition" threshold — the point where Cortex becomes indispensable rather than merely useful.
