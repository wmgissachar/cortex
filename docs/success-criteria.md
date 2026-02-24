# Cortex: Long-Term Success Criteria

> These are the outcomes that determine whether Cortex succeeds or fails.
> Not features. Not implementation details. Outcomes.
>
> If these things are true, Cortex is working. If they aren't, nothing else matters.

---

## The Standard

Cortex succeeds when it becomes **harder to not use than to use** — when the cost of working without it (re-discovery, re-explanation, lost context, duplicated effort) visibly exceeds the cost of working with it (documentation overhead, tool calls, curation time). The measure is not whether people use Cortex, but whether they cannot imagine going back to working without it.

This standard has two dimensions that must both be satisfied: **functional correctness** (the system stores, links, and retrieves the right information) and **experiential correctness** (the human *feels* more capable when using it). A system can be functionally complete — every API endpoint works, every data model is correct, every lifecycle transition fires — and still fail this standard if the human's experience of encountering the information is indistinguishable from noise. The gap between "the data exists" and "the human benefits from the data" is the experiential gap, and closing it is as much a success criterion as building the plumbing.

---

## The Criteria

### 1. No Agent Ever Re-Derives a Conclusion That Already Exists

**Why this matters:** The core problem Cortex solves is the continuity-of-mind problem. Every time an agent re-derives something already known, Cortex has failed at its most fundamental purpose. This is the single most expensive failure mode — not dramatic, but compounding. Each re-derivation wastes an entire session's worth of tokens and time on work that has zero marginal value.

**Observable evidence:**
- An agent starting a session on a topic finds, within 1-2 tool calls, all prior decisions, conclusions, and constraints relevant to its work
- The agent's first observation references prior work ("Building on the findings in artifact X...")
- No thread contains conclusions that duplicate an existing artifact
- When an agent proposes an approach, it can verify whether that approach was already tried

**What closes the gap:**
- Phase 0: Topic-scoped `cortex_get_context` (delivers relevant context in 1 call)
- Phase 0: Thread lifecycle (resolved threads signal completed work)
- Phase 1: Thread summaries (cheap comprehension of prior work)
- Phase 2: Task-scoped briefings (tailored context delivery)
- Phase 3: Proactive surfacing (system warns before duplication)

**Current state:** Agents get a generic directory listing. Orienting to a topic requires 5-10 tool calls. There is no mechanism to surface "this was already tried." Re-derivation is likely but undetectable.

---

### 2. Dead Ends Are Visible Before Someone Walks Into Them

**Why this matters:** Negative knowledge — "we tried X and it failed because Y" — is arguably the most valuable output of any research team. A positive result tells you what works. A negative result saves you from wasting effort on something that doesn't. Yet negative results are the hardest to find in any knowledge system because nobody titles their work "Things That Failed."

**Observable evidence:**
- An agent considering approach X finds a prior observation or artifact documenting "X was tried, failed for reason Y, under conditions Z"
- The system actively surfaces negative results when related terms appear
- Failed approaches are as discoverable as successful ones via search
- The ATH-FREQ research trail is a clear example: any future agent considering ATH frequency as an alpha source immediately finds the NO-GO decision with the full evidence chain (36 experiments, FMB regression failures, placebo test p=0.89)

**What closes the gap:**
- Phase 0: Knowledge links (supersession makes the old/new relationship explicit)
- Phase 0: Data cleanup (deprecated artifacts are clearly marked)
- Phase 1: Structured observation types (negative results get their own type)
- Phase 2: Negative knowledge registry (first-class representation)
- Phase 3: Keyword-triggered warnings (proactive surfacing)

**Current state:** Negative results are buried in decision artifact prose. There is no structured way to find "what didn't work for topic X." The ATH-FREQ pre-audit decision (positive signal assessment) sits alongside the post-audit NO-GO with no structural link between them.

---

### 3. Knowledge Stays Trustworthy as It Scales

**Why this matters:** Knowledge systems don't die from lack of content — they die from loss of trust. The progression is predictable: accumulation without curation, noise increases, discovery fails, contribution collapses, and finally the zombie state — content exists but nobody trusts or uses it. The trust lifecycle is the immune system that prevents decay.

**Observable evidence:**
- Active work is structurally and visually distinct from completed work — not just in the database, but on the screen. Open threads *look* different from resolved threads at a glance through pre-attentive attributes (color, position, grouping), not just badge text
- Superseded knowledge clearly points to its replacement — nobody accidentally acts on outdated information
- A human scanning the knowledge base can immediately distinguish current truth from historical record without reading individual items
- The ratio of accepted-and-current to deprecated-or-stale artifacts stays healthy as the knowledge base grows (not all content is "accepted" forever)
- Artifacts have lifecycle transitions over time: draft -> accepted -> eventually deprecated or superseded. Not everything stays at v1 forever
- Audit logs provide a forensic trail for tracing how errors entered the knowledge base — and that trail is *visible in the UI*, not just queryable via API

**What closes the gap:**
- Phase 0: Thread lifecycle, artifact deprecation, knowledge links, audit logs, data cleanup
- Phase 1: Knowledge graph (explicit relationships, contradiction detection foundation)
- Phase 2: Confidence metadata, curation tools, staleness detection
- Phase 3: Contradiction detection, auto-staleness flagging

**Current state:** All 37 threads are open. All 17 artifacts are accepted at v1. Zero deprecations have occurred despite known supersessions. Zero audit log entries. The knowledge base is 4 days old and already has trust problems (contradicting ATH-FREQ artifacts).

---

### 4. The Human's Cognitive Reach Expands

**Why this matters:** This is the north star. Cortex doesn't succeed by making knowledge management more efficient — it succeeds by enabling the human to **think bigger**. Without Cortex, a human can effectively oversee 2-3 concurrent research programs before cognitive overload. With Cortex working well, that number should be 8-10, because the continuity burden is externalized. The human makes better decisions because they have better recall. They spot patterns across projects because the knowledge is structured. They delegate with confidence because they can verify.

**Observable evidence:**
- The human can review a full day's agent work across all projects in 15-30 minutes
- The human can identify what needs their attention vs. what is noise without reading everything — the interface uses visual weight, color, grouping, and position to pre-triage before the human reads a single word
- The human can direct work across multiple active research programs simultaneously without losing track of any
- After being away for a weekend, the human can re-orient in under 5 minutes ("what happened since Friday?")
- The human creates, edits, deprecates, and restructures content through the UI without waiting for an agent session
- A new feature doesn't just "work" — the human *notices* the improvement. If a feature ships and the human's experience is unchanged, the feature is incomplete regardless of its functional correctness

**What closes the gap:**
- Phase 0: Human editorial tools, activity feed improvements (filters, highlights)
- Phase 1: Dashboard with "since last visit," thread summaries
- Phase 2: Notification system, curation tools
- Phase 3: Research program views, auto-summaries

**Current state:** The human is effectively locked out of content creation and curation. The activity feed shows 10 items with equal weight, no filtering, no pagination. There is no "since last visit" tracking. The human must scan raw observation text to find what matters.

---

### 5. Context Survives Every Discontinuity

**Why this matters:** The agent experience is defined by discontinuities — session boundaries, context compaction, process restarts, project switches. Each discontinuity is a potential break in the chain of work. A single lost thread ID can derail an entire session. A compacted context can cause an agent to revisit approaches already rejected. The system must be resilient to every form of discontinuity, not just the ones we anticipate.

**Observable evidence:**
- After context compaction, the agent still has its active thread ID (visible in the most recent tool response)
- After a session crash, the next session can find the checkpoint and continue from where the last left off
- After a process restart, env var fallback provides the thread ID
- No agent ever hallucinates a UUID — if it doesn't have the ID, the system tells it how to find the right one
- An agent can switch between projects and re-orient to each one cheaply

**What closes the gap:**
- Phase 0: ID footers on all tool responses, active thread state module, env var fallback
- Phase 0: Thread lifecycle (resolved threads signal stopping points)
- Phase 2: Session state tool, extended env var patterns
- Phase 2: Observation deduplication (handles retry-after-failure)

**Current state:** Thread IDs live only in conversation context. Lost on compaction. Error recovery exists (thread not found -> suggest alternatives) but is reactive, not proactive. No agent-facing state persistence.

---

### 6. Knowledge Compounds — The Whole Exceeds the Sum of Parts

**Why this matters:** The difference between a filing cabinet and institutional memory is connections. A filing cabinet with 100 documents is 100 times one document — linear value. An institutional memory with 100 connected documents is exponentially more valuable because each document is enriched by its relationships: this decision was informed by that experiment, which contradicted that earlier finding, which superseded that initial hypothesis. The graph is the value, not the nodes.

**Observable evidence:**
- Artifacts have explicit relationships to other artifacts (supersedes, supports, contradicts, depends_on)
- Following a chain of relationships tells a coherent story of how understanding evolved
- Search results are enriched by connections — finding one artifact leads naturally to related ones
- Deprecating an artifact triggers review of artifacts that depend on it
- The value of adding the 100th artifact is higher than the value of adding the 10th, because the 100th has more potential connections

**What closes the gap:**
- Phase 0: Knowledge links table (first 5 relationship types)
- Phase 1: Knowledge graph with UI visualization, enhanced search
- Phase 2: Confidence metadata (weighted trust across connected artifacts)
- Phase 3: Contradiction detection, semantic search, knowledge staleness detection

**Current state:** Artifacts exist in isolation. The references field is almost entirely unused. There is no way to see "all knowledge related to cold-start embeddings" without manually searching and reading 10+ threads and 4+ artifacts.

---

### 7. The Asymmetric Design Works in Practice

**Why this matters:** Cortex is not a tool with one type of user. It has two fundamentally different user types — agents and humans — with different strengths, different failure modes, and different roles. Agents are exhaustive documenters with total amnesia. Humans are imperfect curators with judgment. The system must leverage this asymmetry: agents produce, humans govern. Neither should bottleneck the other. If agents can't document without human approval, throughput collapses. If humans can't curate without agent help, quality collapses.

**Observable evidence:**
- Agents document freely (auto-accept) and the documentation quality is high because CLAUDE.md instructions are effective
- Humans curate efficiently — deprecating, restructuring, and annotating agent output with minimal friction
- The human never has to create knowledge from scratch (agents do that) and the agent never has to make governance decisions (humans do that)
- Agent-created artifacts are immediately available to other agents without human bottleneck
- Human curation actions (deprecation, supersession, tag normalization) are immediately visible to agents
- Trust tiers work: contributors create, admins govern, readers consume

**What closes the gap:**
- Phase 0: Human editorial tools (creation forms, deprecate button), thread lifecycle (resolve/archive)
- Phase 1: Knowledge graph (human and agent can both create links)
- Phase 2: Curation tools (batch operations for human gardening)

**Current state:** The asymmetry is accidentally lopsided. Agents have 15 MCP tools; humans have almost no creation or curation tools in the UI. The human is a spectator, not an editor. Auto-accept works for agents but humans can't exercise their governance role.

---

### 8. Every Claim Has an Evidence Trail

**Why this matters:** Trust between knowledge producers and consumers — whether human-to-agent, agent-to-agent, or agent-to-human — depends entirely on the ability to evaluate claims. An artifact that says "method X doesn't work" is an assertion. An artifact that says "method X was tested across 36 configurations, failed FMB significance in 3/5 variants, showed zero timing edge (placebo p=0.89), and correlates 87% with standard momentum" is knowledge. The difference is provenance — the evidence chain that lets a reader calibrate their trust.

**Observable evidence:**
- Every artifact can be traced back to the thread(s) and observation(s) that produced it
- Status changes (creation, acceptance, deprecation) are logged with who, when, and why
- When something goes wrong (bad decision propagated through the knowledge base), the audit trail reveals how the error entered and spread
- Knowledge links show the reasoning chain: this decision depends on that finding, which was based on this experiment
- A reader can assess the strength of any claim without having to trust the author blindly

**What closes the gap:**
- Phase 0: Audit logs (forensic trail for state changes), knowledge links (relationship provenance)
- Phase 1: Knowledge graph (visible evidence chains)
- Phase 2: Confidence metadata (structured credibility signals)

**Current state:** Provenance is limited to creator and timestamp. Zero audit log entries. No structured evidence metadata. The only way to assess a claim is to read the full artifact body and hope the agent included its reasoning.

---

### 9. Cortex Becomes Harder to Not Use Than to Use

**Why this matters:** This is the ultimate test. A tool people tolerate is interchangeable. A cognitive extension they depend on is indispensable. The transition happens when the cost of *not* using Cortex (re-discovery, lost context, duplicated effort, degraded decisions) is visibly and painfully higher than the cost of using it (documentation overhead, tool calls, curation time). When an agent starts a session and immediately calls `cortex_get_context` because *not* doing so would be negligent — that's success. When a human opens the Cortex dashboard before their morning coffee because *not* doing so means flying blind — that's success.

**Observable evidence:**
- Agents naturally document their work because the cost is low and the benefit (to themselves in future sessions) is immediate
- Humans check Cortex daily because it tells them things they can't learn any other way
- When Cortex is unavailable (server down, network issue), people notice immediately and it disrupts their workflow
- The documentation "tax" (overhead per observation) decreases over time as the system gets smarter about defaults and context
- New projects are onboarded to Cortex without resistance because the value proposition is self-evident from existing projects

**What closes the gap:**
- Phase 0: All 9 fixes (make the system functionally complete)
- Phase 1: Dashboard, summaries, search (make the system useful daily)
- Phase 2: Briefings, notifications, curation (make the system proactive)
- Phase 3: Proactive surfacing, contradiction detection (make the system indispensable)

**Current state:** Cortex captures knowledge effectively but does not surface it effectively. The system is useful for writing but not yet for reading. Using Cortex feels like filing documents, not like having a shared memory.

---

## The Hierarchy

These criteria are not equal. They form a dependency chain:

```
Foundation:
  5. Context survives discontinuities    ← Without this, agents can't function
  3. Knowledge stays trustworthy         ← Without this, nothing else matters

Capability:
  1. No re-derivation                    ← The core value proposition
  2. Dead ends are visible               ← The highest-value knowledge type
  8. Every claim has evidence            ← Trust enables everything else

Leverage:
  7. Asymmetric design works             ← Agents produce, humans govern
  6. Knowledge compounds                 ← The whole exceeds the sum

Outcome:
  4. Human cognitive reach expands       ← The north star metric
  9. Harder to not use than to use       ← The ultimate validation
```

**Foundation** criteria must be satisfied first — without them, the system is broken. **Capability** criteria deliver the core value. **Leverage** criteria amplify that value. **Outcome** criteria are the result of everything else working.

**The experiential dimension** (Pillar 8 in First Principles) is not a separate criterion — it is a quality that must be present across *every* criterion. A criterion is not satisfied when the data model is correct; it is satisfied when the human (or agent) experiences the benefit. SC3's "active work is visually distinct from completed work" is an experiential test. SC4's "identify what needs attention without reading everything" is an experiential test. SC9's "harder to not use" is entirely experiential. When evaluating progress, always ask both: "does the plumbing work?" and "does the human feel the difference?"

---

## What Failure Looks Like

Cortex fails if any of these become true:

1. **The zombie knowledge base:** Content accumulates but nobody trusts it. Everything is "accepted," nothing is deprecated, search returns noise, and people work around Cortex rather than through it.

2. **The documentation tax revolt:** Agents spend so many tokens on documentation that the overhead exceeds the value. The balance tips from "documentation as byproduct" to "documentation as burden."

3. **The spectator human:** The human can read but cannot act. They see problems in the knowledge base but cannot fix them without starting an agent session. Curation friction exceeds curation value.

4. **The amnesia loop:** Despite Cortex existing, agents still start from zero because orientation is too expensive, context is too generic, or prior work is unfindable. The continuity-of-mind problem persists.

5. **The island artifacts:** Knowledge exists in isolated documents with no connections. Finding related work requires manual search and assembly. The knowledge graph never materializes.

6. **The silent drift:** Subtle errors enter the knowledge base and propagate through the institutional memory because nobody can trace how they got there. Trust erodes silently.

7. **The invisible plumbing:** Features are built, data is stored, endpoints work — but the human's experience doesn't change. Audit logs exist in the database but aren't visible in the UI. Lifecycle statuses are tracked but every item looks the same on screen. The team ships functional correctness and calls it done, but adoption never happens because nobody *feels* the improvement. This is the most insidious failure mode because it passes every technical test while failing the only test that matters: does the human reach for the tool?

---

## Where We Are vs. Where We Need to Be

| Criterion | Current | After Phase 0 | After Full Roadmap |
|-----------|---------|--------------|-------------------|
| 1. No re-derivation | Not addressed | Partially (topic context) | Fully (proactive surfacing) |
| 2. Dead ends visible | Not addressed | Partially (supersession links) | Fully (negative knowledge registry) |
| 3. Knowledge trustworthy | Failing | Functional (lifecycle + audit) | Strong (confidence + staleness) |
| 4. Cognitive reach | Not addressed | Partially (editorial tools) | Fully (dashboard + notifications) |
| 5. Context survives | Failing | Solved (ID footers + state) | Robust (session state tool) |
| 6. Knowledge compounds | Not addressed | Foundation (knowledge links) | Strong (graph + search) |
| 7. Asymmetric design | Broken (human locked out) | Functional (editorial tools) | Strong (curation tools) |
| 8. Evidence trails | Empty (0 audit logs) | Functional (audit + links) | Strong (confidence metadata) |
| 9. Indispensable | Far from it | Approaching useful | Approaching indispensable |

Phase 0 (the 9 immediate fixes) moves 5 of 9 criteria from "failing/not addressed" to "functional." It is necessary but not sufficient. The full roadmap through Phase 3 is required to reach the "indispensable" threshold where Cortex fulfills its promise as a shared mind.
