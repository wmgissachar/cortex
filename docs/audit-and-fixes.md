# Cortex Audit: First Principles Alignment Assessment

> Audit date: February 8, 2026
> Scope: Full codebase, database content, MCP tools, web UI
> Evaluated against: `docs/first-principles.md` (21 principles)

---

## Executive Summary

Cortex has a solid technical foundation — the API, database schema, MCP tools, and web UI are all functionally complete. The core loop works: agents create threads, post observations, and produce artifacts. Knowledge accumulates.

However, measured against the first principles, Cortex is operating as a **write-only knowledge store** rather than a **living institutional memory**. The system is strong at capture and weak at everything that happens after capture: lifecycle management, curation, retrieval optimization, and human oversight.

**Of the 21 first principles:**
- 1 is well-served (A7)
- 10 are partially served with significant gaps
- 10 are not served at all

The most critical deficiencies cluster around three themes:
1. **No lifecycle management** — content accumulates but never transitions, ages, or gets retired
2. **Humans are locked out of authorship and curation** — the UI is read-only for everything except comments and task status
3. **No intelligence layer** — the system stores knowledge but does not organize, summarize, connect, or surface it proactively

---

## Current State: By the Numbers

| Metric | Value | Implication |
|--------|-------|-------------|
| Threads | 37 | All open, zero resolved/archived |
| Comments | 94 | 100% agent-authored, 100% depth-0 (flat) |
| Artifacts | 17 | All accepted v1, all agent-created |
| Tasks | 3 | 1 test, 1 done, 1 stale open since Feb 6 |
| Audit logs | 0 | Not populated despite ~160 write operations (37 threads + 94 comments + 17 artifacts + 3 tasks + ~10 auto-created discussion threads) |
| Human-created content | 1 task | Zero threads, comments, or artifacts |
| Thread types used | discussion (35), decision (2) | question and incident types unused |
| Nested comments | 0 | Capability exists in schema but is not exposed in any interface — neither the web UI comment form nor the MCP `observe` tool support setting `parent_id` |
| Artifact references | ~0 | Schema supports it but field is empty on most artifacts |
| Deprecated artifacts | 0 | Despite known supersessions (ATH-FREQ pre/post-audit) |

---

## Principle-by-Principle Scorecard

### Foundational Pillars

| # | Principle | Rating | Assessment |
|---|-----------|--------|------------|
| 1 | Continuity over completeness | Partial | Agents document work, but no lifecycle means future agents can't distinguish active vs. completed work. 37/37 threads open makes the thread list a flat undifferentiated mass. |
| 2 | Push over pull | Not met | Everything is pull-based. cortex_get_context gives a generic overview. No proactive surfacing based on what the agent is doing or what the human needs. |
| 3 | Provenance is non-negotiable | Partial | Creator and timestamp tracked. But no confidence levels, no evidence chains, no methodology metadata as structured fields. Provenance lives only in prose. |
| 4 | Lifecycle is mandatory | Not met | Zero threads resolved. Zero artifacts deprecated. Zero version progressions. No staleness detection. No supersession tracking. ATH-FREQ pre-audit is silently superseded by post-audit with no structural link. |
| 5 | Asymmetry is a feature | Partial | Agent auto-accept works. But the asymmetry is accidentally lopsided: agents have 15 rich creation tools via MCP; humans have almost no creation or curation tools via UI. |
| 6 | Capture as byproduct | Partial | CLAUDE.md instructions drive documentation, and agents comply. But this is documentation as a mandated activity, not as a natural byproduct of work. Agents must decide what to document, how to structure it, and where to put it — each is a friction point that the principle says should be eliminated. Works because agents are compliant, not because the design makes capture automatic. |
| 7 | Design for compounding | Weak | No knowledge graph. Artifact references field exists but barely used. No connections between related threads. No synthesis. Knowledge accumulates linearly rather than compounding. |

### Human Principles

| # | Principle | Rating | Assessment |
|---|-----------|--------|------------|
| H1 | Summary over stream | Not met | No summaries anywhere. Human sees raw thread listings and raw observation text. Activity feed is a chronological stream, not a prioritized summary. |
| H2 | Triage is the interface | Not met | Everything presented with equal visual weight. No action levels. No distinction between "act on this," "FYI," and "background." |
| H3 | Human is editor, not author | Partial | True in practice (0 human-authored content), but poorly supported. Human can only: post comments, accept/reject proposed artifacts, change task status. Cannot create, edit, deprecate, archive, or restructure anything. |
| H4 | Design for the return | Not met | No "since last visit" tracking. No layered re-entry. No catch-up summaries. Human must manually scan activity feed and guess what happened. |
| H5 | Trust through transparency | Partial | Creator kind (human/agent) displayed. But no confidence indicators, no contradiction detection, no "unreviewed artifacts" view, no dispute mechanism. |
| H6 | Attention as currency | Not met | Activity feed shows everything equally. No priority filtering. No smart notifications. UI does not distinguish what deserves human attention vs. what is noise. |
| H7 | Scope expansion is success | Limited | System helps track work but does not actively expand oversight capacity. No aggregated views, no portfolio-level insights, no cross-project patterns. |

### Agent Principles

| # | Principle | Rating | Assessment |
|---|-----------|--------|------------|
| A1 | Briefing over directory | Not met | cortex_get_context returns topic list, thread titles, artifact titles — an inventory, not a briefing. No narrative context, no task-scoped orientation, no "state of play." |
| A2 | Sticky state survives compaction | Not met | Thread IDs live only in conversation context. Lost on compaction. Error recovery exists (thread not found → suggest alternatives) but is reactive, not proactive. |
| A3 | Write for the sixth month | Mixed | Average observation is 1381 chars (substantial). But 19/94 comments tagged "checkpoint" are routine progress updates that won't be valuable long-term. No quality differentiation mechanism. |
| A4 | Negative knowledge is first-class | Not met | No way to categorize or surface "tried and failed" outcomes. Negative results buried in decision artifact prose. Future agents can't search for "what didn't work." |
| A5 | Orientation should be cheap | Partial | cortex_get_context is 1 call (~500-2000 tokens). But useful orientation requires 5-10 additional reads. Total orientation cost: 5,000-15,000 tokens before productive work begins. |
| A6 | Provenance enables trust | Partial | Creator and timestamp visible. But no evidence chain metadata, no confidence levels, no methodology classification as structured data. |
| A7 | Agent is primary author | Good | 100% of content is agent-authored. MCP tools provide good authorship capabilities. Documentation tax exists (300-700 tokens per observation) but is manageable. |

---

## Key Findings

### What Is Working Well

1. **Core data model is sound.** Topics, threads, comments, artifacts, tasks — the primitives are right. The schema is well-designed with proper indexes, triggers, and constraints.

2. **Agent documentation loop works.** Agents create threads, post observations, and produce artifacts. The CLAUDE.md instructions are effective at driving documentation behavior. 94 observations across 4 days shows active capture, though ~20% are routine checkpoints of lower long-term value.

3. **Full-text search is functional.** PostgreSQL tsvector search with ranking works across all content types. Search vectors are 100% populated.

4. **Auto-accept for agent artifacts is a good design decision.** It removes friction from the agent authorship workflow without requiring human bottleneck.

5. **MCP tool error recovery for common failures.** The "thread not found" and "topic not found" error handling with recovery instructions is a genuine quality-of-life improvement for agents.

6. **Activity feed combining all entity types.** The UNION ALL activity feed gives a unified view of workspace activity. It's a foundation to build on.

### What Is Not Working

1. **Zero lifecycle management in practice.** All 37 threads are open. All 17 artifacts are at version 1. No deprecation has ever occurred. The system has no concept of "done," "stale," or "superseded" in actual use — only in schema definitions.

2. **Humans are effectively locked out of content creation and curation.** The web UI has no forms for creating threads, artifacts, or tasks. No editing capability for any content type. No deprecation, archiving, or restructuring. The hooks exist in code but are not exposed in the UI. The human is a spectator, not an editor.

3. **The activity feed is noise, not signal.** Ten items shown with equal weight, no filtering, no action levels. A checkpoint observation about routine progress looks identical to a decision artifact that changes the research direction. The human must read everything to find what matters.

4. **Knowledge does not compound.** Artifacts exist in isolation. The references field is almost entirely unused. There is no way to see "all knowledge related to cold-start embeddings" without manually searching and piecing together 10+ threads and 4+ artifacts. No knowledge graph, no connections, no synthesis.

5. **Agent orientation is expensive and generic.** cortex_get_context returns a flat directory regardless of what the agent is about to work on. An agent continuing cold-start embedding work gets the same overview as an agent starting fresh on a new topic. Orientation requires 5-10 additional tool calls.

6. **Provenance is minimal.** Who created it and when — that's all the system tracks. No confidence levels, no methodology classification, no evidence chain metadata. The difference between a preliminary hypothesis and a conclusion backed by 36 experiments is invisible in the metadata.

7. **No audit trail despite the schema existing.** The audit_logs table is empty. Not a single write operation has been logged, despite ~160 mutations (37 threads + 94 comments + 17 artifacts + 3 tasks + auto-created discussion threads).

8. **Artifact versioning is decorative.** The `version` field exists (INTEGER, default 1) and all 17 artifacts are at v1. But there is no path to v2 — the `update` route and MCP tool both restrict edits to draft-status artifacts only. Once accepted, an artifact cannot be edited, only deprecated. The version field implies incremental updates but the system doesn't support them.

### Patterns in How the System Is Actually Used

1. **Agents create ~1 thread per work session** with 1-15 observations. This is the natural unit of work documentation.

2. **Artifacts cluster at the end of research programs.** Decision artifacts summarize multi-session work. This is the right pattern — distillation after exploration.

3. **Tags are inconsistent.** `cold-start` (19 uses) vs `cold-start-embeddings` (4), `implementation` (4) vs `implementation-plan` (6). No tag vocabulary enforcement.

4. **Nested comments are not exposed in any interface.** All 94 comments are depth 0. The schema supports nesting (parent_id, depth) but neither the web UI comment form nor the MCP observe tool accepts a parent_id parameter. The capability is structurally unavailable, not merely unused.

5. **Only two thread types are used** (discussion, decision). Question and incident types have zero usage despite being defined.

6. **Auto-created discussion threads for artifacts are mostly empty.** Of the 10 artifacts with thread_id (created after the feature was added), most discussion threads have 0 comments.

---

## Immediate Priority Fixes

These are ordered by impact against first principles. Each fix addresses a principle violation that, if left unaddressed, will compound as the knowledge base grows.

> **Note on execution order:** Fix 9 (Batch Data Cleanup) should be executed first or in parallel with the tooling fixes, as clean data makes all subsequent improvements more effective and provides concrete test cases. The ordering below reflects *priority of impact*, not execution sequence.

### Fix 1: Batch Data Cleanup (Execute First)

**Principles violated:** Pillar 4 (Lifecycle), Pillar 1 (Continuity)

**Problem:** Current data has accumulated issues that undermine every other improvement:
- 37/37 threads are open despite most representing completed work
- 5 threads with 0 comments (empty shells)
- ATH-FREQ pre-audit decision is accepted but superseded by post-audit NO-GO — both appear authoritative
- Tag inconsistencies (`cold-start` vs `cold-start-embeddings`)
- 1 stale task open since Feb 6 with no updates

**Fix:**
- Resolve completed threads (batch update ~25 threads)
- Deprecate the ATH-FREQ pre-audit decision artifact, linking to post-audit
- Delete or resolve empty threads
- Update stale task status
- Normalize tags (merge `cold-start-embeddings` → `cold-start`, `implementation-plan` → `implementation`)

**Justification:** Data remediation is a prerequisite for the tooling fixes. Fixes 2-9 build features for lifecycle management, thread resolution, and supersession — but the motivating examples already exist in the data. Clean data first, then build tools to keep it clean.

---

### Fix 2: Thread Lifecycle Management (UI + MCP)

**Principles violated:** Pillar 4 (Lifecycle), Pillar 1 (Continuity), H2 (Triage), H4 (Return), A3 (Write for Sixth Month)

**Problem:** All 37 threads are open. Future agents and the human cannot distinguish active work from completed research. As content grows, this makes the thread list — and search results — increasingly noisy. Agents cannot resolve their own threads because no MCP tool exists for it.

**Fix:**
- Add "Resolve Thread" and "Archive Thread" actions to the Thread detail page (UI)
- Add `cortex_update_thread` MCP tool with parameters: id, status (open/resolved/archived), title
  - Note: the API `PATCH /threads/:id` endpoint already exists and supports status updates; the fix is adding a 1-file MCP tool wrapper and UI buttons
- Update CLAUDE.md: "When your work is complete, post a final summary observation then resolve the thread"

**Justification:** This is the lowest-effort, highest-impact fix. Thread status already exists in the schema; the API endpoint already accepts status changes. The MCP tool is a single new file. Once threads can be resolved, the entire knowledge base becomes navigable — filter to "open" for active work, "resolved" for historical record.

---

### Fix 3: Human Editorial Tools in Web UI

**Principles violated:** Pillar 5 (Asymmetry), H3 (Editor not Author), H6 (Attention as Currency)

**Problem:** The human cannot create, edit, deprecate, or restructure content through the web UI. All React Query mutation hooks exist in the frontend code but are not connected to any UI forms. The human's editorial role (per H3) requires editorial tools — editing existing content is higher priority than creating new content, per the principle's own logic.

**Fix (editorial actions — highest priority):**
- Add inline edit capability for thread titles, artifact bodies (accepted artifacts need a "create new version" flow), and task details
- Add "Deprecate" button on Artifact detail page (admin only) — note: `POST /artifacts/:id/deprecate` API endpoint already exists
- Add "Resolve" / "Archive" buttons on Thread detail page

**Fix (creation forms — second priority):**
- Add "New Thread" button on Topic detail page with form (title, type, body, tags)
- Add "New Task" button on Tasks page with form (title, body, priority, due date, topic, tags)
- Add "New Artifact" button on Topic detail page with form (title, type, body, summary, tags)

**Justification:** The asymmetry principle says humans curate while agents document. But curation requires tools. The human's editorial actions should be prioritized over creation forms — the human is an editor, not an author.

---

### Fix 4: Compaction-Resilient Agent State

**Principles violated:** A2 (Sticky State Survives Compaction)

**Problem:** Thread IDs are lost when an agent's context window compacts. The agent may then hallucinate UUIDs or be unable to post observations. The first-principles document calls compaction "the most insidious failure mode for agents." The current mitigation (error recovery instructions) is reactive.

**Fix:**
- Append active thread_id to every MCP tool response as a footer line: `> Active thread: {thread_id}`
- This is a ~1-line change per tool response template in each MCP tool file
- The thread_id can be sourced from `CORTEX_CHECKPOINT_THREAD_ID` env var or from the most recent `create_thread` call in the session

**Justification:** This is trivially low effort (append a line to tool responses) but directly prevents the most common and damaging agent failure mode. The ID remains in recent context even after compaction because it appears in every tool response, not just the original create_thread response.

---

### Fix 5: Artifact Supersession and Deprecation

**Principles violated:** Pillar 4 (Lifecycle), Pillar 3 (Provenance), H5 (Trust through Transparency)

**Problem:** The ATH-FREQ research has two contradicting decision artifacts, both status "accepted." The supersession is only indicated in the post-audit title text, which is fragile and unsearchable.

**Fix:**
- Rather than adding a `superseded_by` FK column (which would conflict with the Phase 1 knowledge graph), implement supersession as the first use case of a `knowledge_links` table: `source_id, target_id, link_type (supersedes|supports|contradicts|depends_on|related_to), created_by, created_at`
- When an artifact is deprecated with a supersession link, display prominently: "This artifact has been superseded by [link]"
- In search results, demote or flag deprecated artifacts
- Expose the existing `POST /artifacts/:id/deprecate` endpoint in the UI (admin)
- Add optional `supersedes` parameter to `cortex_draft_artifact` MCP tool

**Justification:** Building the knowledge_links table now (rather than a narrow `superseded_by` FK) avoids a schema conflict with the Phase 1 knowledge graph feature. The table supports supersession immediately and other relationship types later. One migration, no dead code.

---

### Fix 6: Enrich `cortex_get_context` for Agent Orientation

**Principles violated:** A1 (Briefing over Directory), A5 (Orientation should be cheap)

**Problem:** cortex_get_context returns a flat directory listing. An agent continuing cold-start research gets the same overview as one starting fresh. Useful orientation requires 5-10 additional tool calls (5,000-15,000 tokens).

**Fix:**
- Add optional `topic_id` parameter to scope the overview to a specific topic
- When topic-scoped: return recent threads for that topic (with status and comment counts), recent artifacts with summaries, open tasks
- Add a "Recent Decisions" section that prioritizes decision artifacts
- Include thread status so agents can see what's active vs. resolved
- Increase default budget to 6000 chars
- Note: this requires changes at three layers — MCP tool schema, API client, and API endpoint (the context endpoint currently doesn't support topic filtering). Effort is Low-Medium.

**Justification:** Topic scoping is the highest-leverage improvement. Most agent sessions work within a single topic; delivering topic-relevant context in 1 call instead of 5-10 dramatically reduces orientation cost and context window consumption.

---

### Fix 7: Populate Audit Logs

**Principles violated:** Pillar 3 (Provenance), H5 (Trust through Transparency)

**Problem:** The audit_logs table exists with a well-designed schema but is completely empty. Zero operations logged despite ~160 mutations.

**Fix:**
- Add audit logging calls in the service layer for state-change events: artifact creation and status changes, thread creation and status changes, task status changes
- Include before/after state in the `changes` JSONB field for status transitions
- Focus on state changes, not routine reads or comment creation

**Justification:** The audit trail is the forensic capability needed when something goes wrong — tracing how an error entered the knowledge base. The schema is already designed; the implementation is adding service-layer calls.

---

### Fix 8: Tag Normalization

**Principles violated:** Pillar 7 (Compounding), A5 (Orientation)

**Problem:** Tags are inconsistent: `cold-start` (19) vs `cold-start-embeddings` (4), `implementation` (4) vs `implementation-plan` (6).

**Fix:**
- Define a tag vocabulary for each topic (stored in topic settings JSONB)
- Normalize existing tags (merge duplicates)
- Add tag autocomplete in MCP tools and web UI based on existing tags

**Justification:** Tags are the lightweight categorization layer. Inconsistent tags are useless for filtering. A controlled vocabulary with autocomplete is low-effort and high-value.

---

### Fix 9: Activity Feed Improvements

**Principles violated:** H2 (Triage), H6 (Attention as Currency), H1 (Summary)

**Problem:** Activity feed shows 10 items (a frontend choice — the API defaults to 20) with equal weight, no filtering, no pagination. A routine checkpoint looks identical to a decision artifact.

**Fix:**
- Add type filtering (show only artifacts, only threads, etc.)
- Add pagination (load more / infinite scroll)
- Visually differentiate by significance: artifact creation > thread creation > decision observation > routine checkpoint
- Add a "Highlights only" mode (artifacts and decision-type comments only) — this provides a basic form of H2 (Triage)
- Increase frontend default from 10 to 25

**Justification:** The activity feed is the human's primary situational awareness window. Filtering and significance sorting transform it from noise to signal.

---

## Summary of Fixes by Priority

| Priority | Fix | Principles Addressed | Effort |
|----------|-----|---------------------|--------|
| 1 | Batch data cleanup | Pillars 1, 4 | Low |
| 2 | Thread lifecycle (UI + MCP tool) | Pillars 1, 4; H2, H4; A3 | Low |
| 3 | Human editorial tools + creation forms | Pillar 5; H3, H6 | Medium |
| 4 | Compaction-resilient agent state (ID footers) | A2 | Low |
| 5 | Artifact supersession (knowledge_links table) | Pillars 3, 4; H5 | Medium |
| 6 | Enrich cortex_get_context | A1, A5 | Low-Medium |
| 7 | Populate audit logs | Pillar 3; H5 | Low |
| 8 | Tag normalization | Pillar 7; A5 | Low |
| 9 | Activity feed improvements | H1, H2, H6 | Low |

**Net assessment:** 5 of 9 fixes are low effort. 2 are low-medium. 2 are medium. None are high effort. The entire fix list can be implemented incrementally. The `knowledge_links` table introduced in Fix 5 is designed to extend into the Phase 1 knowledge graph feature, avoiding schema churn.

**Key dependency:** The `last_active_at` field already exists on the principals table and is updated for API-key auth (agent requests). A separate `last_seen_at` field is needed for human web sessions (JWT auth path doesn't update `last_active_at`). This is needed for the Phase 1 dashboard feature (deferred from immediate fixes to Phase 1 per the roadmap).
