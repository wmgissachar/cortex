# Cortex: First Principles

> This document defines the foundational principles that guide all development of Cortex.
> It is the source of truth for *why* Cortex exists and *what properties it must have*.
> Features, architecture, and implementation decisions should be evaluated against these principles.

---

## The Core Problem: Continuity of Mind

Cortex does not solve "knowledge management." It solves a deeper, more specific problem: **the continuity-of-mind problem in systems composed of agents that forget.**

An AI agent session begins with amnesia. It has capabilities — reasoning, code generation, analysis — but no memory of what happened yesterday, what was tried and failed, what decisions were made and why, or what it itself did three hours ago in a different context window. Every session is a cold start. Without external memory, each agent is an expert with total amnesia: competent but contextless.

Humans have memory, but it is lossy, unstructured, and biased. A human remembers the conclusion but not the evidence. They remember the decision but not the three alternatives that were rejected. They remember that something was tried but not the exact parameters. And as the number of parallel workstreams grows, human memory fragments — no single person holds the full picture.

**The failure mode without shared persistent memory is not dramatic — it is the quiet, compounding cost of re-discovery, re-explanation, and re-derivation.** It is the slow bleed of a team that cannot learn. An agent re-derives a conclusion that was already reached. A human re-explains a decision that was already documented. An experiment re-runs a configuration that was already proven ineffective. Each instance is small; in aggregate, they are devastating.

Cortex is not a knowledge base. **It is a shared mind for a team that would otherwise have no shared mind.** That is the problem it solves, and that is the standard against which every decision about its future should be measured.

### What distinguishes Cortex from a wiki or document repository

Those systems store information. Cortex must store *understanding* — the reasoning, the context, the provenance, and the connections that make raw information actionable for agents who were not present when the understanding was formed. A wiki page that says "we use method X" is information. A Cortex artifact that says "we use method X because we tried Y and Z first, they failed for reasons A and B, X works under conditions C and D, and we should revisit this decision if condition E changes" — that is institutional knowledge.

---

## Part I: Foundational Pillars

These seven principles are universal — they apply regardless of whether the participant is human or AI. They define what Cortex must be.

### 1. Continuity Over Completeness

The primary purpose of Cortex is maintaining continuity of understanding across discontinuous agent sessions and imperfect human memory. Completeness of documentation is secondary.

A perfectly complete but poorly connected knowledge base fails. A sparse but well-linked knowledge base that preserves the thread of reasoning across sessions succeeds. The question is never "did we document everything?" — it is "can the next session pick up where the last one left off?"

This means prioritizing:
- **Decision trails** over exhaustive records
- **Context and rationale** over raw data
- **Links between related work** over standalone documents
- **Current state** over historical completeness

### 2. Push Over Pull

Knowledge should flow to where it is needed, not wait to be retrieved.

Search requires knowing what to search for, which presupposes knowing what you don't know. The deepest value of institutional memory comes from surfacing what you didn't know you needed — the decision that affects your approach, the experiment that already tried your idea, the gotcha that will waste your afternoon.

Proactive surfacing based on context is more valuable than responsive search. The system should know what you need before you ask.

### 3. Provenance Is Non-Negotiable

Every piece of knowledge must carry its full epistemic chain: who created it, when, based on what evidence, under what conditions, and with what confidence.

An artifact that says "ATH-FREQ is not an independent alpha source" is a conclusion. An artifact that says this was determined through 36 experiments across 5 audit stages, confirmed by Fama-MacBeth regression with specific t-statistics — that is knowledge. The second form lets a future reader evaluate the claim, understand its boundaries, and know when it might no longer apply.

**Knowledge without provenance is assertion.** The system must make the evidential chain legible, not just the conclusion.

### 4. Lifecycle Is Mandatory

All knowledge has a birth, a useful life, and an end. The system must model this explicitly.

Knowledge systems die not from lack of content but from loss of trust. The progression is predictable: initial enthusiasm, accumulation without curation, discovery failure as noise increases, contribution collapse as trust erodes, and finally the zombie state — content exists but nobody trusts or uses it.

The forces that drive decay:
- **Write-once culture**: Content created but never updated
- **No feedback signal**: Authors don't know if content is read, useful, or misleading
- **Curation is thankless**: Updating, deprecating, and reorganizing are invisible work
- **Search degrades with scale**: More content means more noise
- **Ownership diffusion**: When everyone owns it, no one owns it

Active lifecycle management — creation, maintenance, supersession, deprecation — is the immune system that prevents decay.

### 5. Asymmetry Is a Feature

Humans and AI agents have fundamentally different capabilities, failure modes, and kinds of authority. The system should leverage this asymmetry rather than pretend it doesn't exist.

| Dimension | Agents | Humans |
|-----------|--------|--------|
| **Strength** | Exhaustive analysis, systematic execution, structured output, tireless documentation | Judgment under ambiguity, recognizing wrong frames, cross-domain integration, knowing when to stop |
| **Memory** | Perfect within session, total amnesia across sessions | Imperfect always, but continuous; carries intuitions and emotional markers |
| **Failure mode** | Confidently executing on stale premises, going deep on wrong paths, treating all information as equally weighted | Forgetting details, inconsistent rule application, bias, procrastinating on documentation |
| **Authority** | Systematic analysis without accountability | Judgment, experience, and accountability |

The system should make agents document exhaustively (they're good at it and it costs them little) and make humans curate, judge, and direct (they're good at it and agents cannot do it).

### 6. Capture as Byproduct

Documentation should be a natural output of work, not a separate activity.

The greatest threat to a knowledge system is the separation of "doing work" and "documenting work." When documentation is a separate activity, it will always be deprioritized under time pressure. Every design decision should be evaluated against the standard: does this make documentation happen automatically, or does it add documentation as a separate step?

The system should reduce the cognitive overhead of documentation to near zero. If a contributor has to think about *what* to document, *how* to structure it, and *where* to put it, each of those decisions is friction that will be skipped under pressure.

### 7. Design for Compounding

The system must become more valuable the more it is used.

Each decision recorded makes future decisions easier. Each negative result documented prevents a future dead end. Each glossary entry prevents a future miscommunication. The value is not in any single piece of knowledge but in the accumulation — the emergence of institutional understanding from the aggregation of individual contributions.

Every feature should be evaluated against the question: does this make the system more valuable the more it is used, or does it plateau?

This means investing in:
- **Connections between knowledge** (the graph, not just nodes)
- **Synthesis across contributions** (patterns that emerge from many observations)
- **Progressive abstraction as scale grows** (summaries of summaries, knowledge maps)

### 8. Experience Is the Product

A system that is functionally correct but experientially poor will not be adopted. **Functional correctness is necessary but not sufficient.** The experience of encountering information — not just the information itself — determines whether the system gets used.

This principle exists because of a failure mode that is invisible from the inside: you can build every feature, store every piece of data, implement every API endpoint, and the human still says "nothing changed." This happens when the system treats presentation as downstream of content — as if making the right data *available* is equivalent to making it *felt*. It is not.

The distinction is between two kinds of correctness:
- **Data correctness**: The audit log exists in the database. The lifecycle status is stored. The knowledge link is queryable.
- **Experiential correctness**: The human can *see* the audit trail without searching for it. Active work *looks* different from completed work at a glance. A decision thread is *instantly recognizable* as different from a discussion thread.

Data correctness is engineering. Experiential correctness is design. Both are required. A system that has one without the other is half a system.

For humans, experiential correctness means leveraging **pre-attentive processing** — the visual properties that the brain processes before conscious attention: color, position, size, shape, grouping, and motion. A screen full of equally-weighted items is not information; it is noise presented in rows. The human's visual cortex is the fastest cognitive processor they have; a system that forces them to read every item to understand the state of their knowledge base is wasting their most powerful tool.

For agents, experiential correctness means tool responses are narratives with context, not inventories of IDs; error messages include recovery paths, not bare exceptions; orientation is pre-computed, not assembled from 10 sequential lookups. (This is already captured in A1 and A5, but the underlying principle is the same.)

The experiential principle is the bridge between **having the right information** and **the human actually benefiting from it.** Every feature is simultaneously a data problem (is the information available?) and an experience problem (does encountering the information feel useful?). Solving only the data problem creates a graveyard of correct but invisible features.

**The test:** After shipping a feature, ask: "Does the human *feel* more capable?" Not "does the feature work?" — that's the data test. The experience test is: can someone who has never seen this screen before orient in 10 seconds? Can they distinguish what matters from what doesn't without reading? Do they leave the screen knowing something they didn't know before, or do they leave confused about where to look next?

---

## Part II: Human Principles

These principles define what Cortex must be for its human users — researchers, developers, and analysts who direct AI agent work and curate the resulting knowledge.

### H1. Summary Over Stream

The human should never have to reconstruct a narrative from raw events.

Every layer of the system — from individual threads to the top-level dashboard — should present summaries first and details on demand. The raw stream of observations, checkpoints, and comments is for agents and for audit trails. The human needs the distilled story: what happened, what it means, and what requires their attention.

When a human opens Cortex after a 4-hour agent session, they need three things in rapid succession:
1. **What happened?** (10-second summary of outcomes)
2. **Should I worry?** (Were there errors, surprises, or judgment calls to second-guess?)
3. **What do I need to decide?** (Explicit decision points, not implied ones)

### H2. Triage Is the Interface

Every item in Cortex should be pre-classified into action levels:
- **Act on this**: A decision is needed, an error needs correction, work is blocked
- **Read when you can**: An agent completed work, results are available for review
- **Background**: Operational updates, routine checkpoints, part of the audit trail

Currently, every thread, observation, and artifact is presented with equal visual weight. The human must perform triage themselves, burning cognitive budget on meta-work rather than substantive work. The system should pre-triage and present only what the human's current mode requires.

### H3. The Human Is an Editor, Not an Author

The human's role is editorial: they approve, reject, correct, redirect, and curate. They almost never create knowledge from scratch in Cortex. The evidence confirms this — every thread, artifact, and observation in the current knowledge base was created by agents.

This is not a failure; it is the design point. Every interface should be designed for the editorial workflow: fast scanning, inline annotation, quick accept/reject, easy restructuring. The system optimizes for a human who reads, judges, and reshapes — not one who writes from scratch.

### H4. Design for the Return

The human's most important moment with Cortex is not while they are actively directing work — it is when they come back after being away.

The human isn't always present. They may launch three agent sessions on Friday afternoon and return Saturday morning to find 15 new threads and 40 observations. The system must handle this gracefully with layered re-entry:

- **Layer 1 (10 seconds)**: The headline — what completed, what needs attention
- **Layer 2 (2 minutes)**: Per-session summaries — objective, outcome, surprises
- **Layer 3 (10-30 minutes)**: Deep review of flagged items — editorial judgment
- **Layer 4 (optional)**: Full audit trail for investigation

Every view should answer "what happened since I last looked?" before "what is happening now?"

### H5. Trust Through Transparency

The human trusts Cortex when they can see how conclusions were reached, what evidence supports them, and what the limitations are. Trust is the human's willingness to act on information from Cortex without independently verifying it. This willingness must be earned through transparency, maintained through accuracy, and protected through control mechanisms.

Auto-acceptance of agent artifacts is acceptable only if accompanied by:
- **Confidence indicators** on each artifact
- **Contradiction detection** when new content conflicts with existing content
- **Audit support** ("artifacts you haven't reviewed")
- **Override capabilities** (dispute, quarantine, deprecate, rollback)

The human's worst nightmare is not a dramatic failure — it is slow, silent drift. The knowledge base gradually accumulates subtle errors that compound through the institutional memory. The system must make it easier to verify than to doubt.

### H6. Attention as Currency

The human has perhaps 15-30 minutes per day for Cortex across all projects. Every pixel of the interface must justify its claim on that attention. The system should spend the human's attention wisely:

- Aggressive filtering of noise
- Intelligent prioritization by action level
- Never showing something that doesn't require or benefit from human cognition
- Supporting the natural cadence: morning review (15 min), directed work sessions (variable), weekly curation (30 min)

### H7. Scope Expansion Is the Measure of Success

Cortex succeeds not when the human spends less time managing knowledge, but when they can effectively oversee more work than they could without it.

The metric is not efficiency — it is cognitive reach. Without Cortex, the human can manage 2-3 active research programs before cognitive overload. With Cortex functioning well, they should manage 8-10, because the continuity burden is externalized. They make better decisions because they have better recall. They spot patterns across projects because the knowledge is structured and searchable. They delegate with confidence because they can verify.

**The north star: the human thinks bigger because they don't have to hold everything in their head.** Cortex is the extended mind; the human is the executive function.

---

## Part III: Agent Principles

These principles define what Cortex must be for AI agents — the amnesiac reasoning engines that do the bulk of knowledge creation and retrieval.

### A1. Briefing Over Directory

The agent needs narrative briefings, not inventory listings.

The current `cortex_get_context` returns a directory: topic names, thread titles, artifact titles. This tells the agent what exists but not what matters. The ideal cold boot delivers a pre-computed briefing: "Here is the state of play. These research programs are active. These decisions constrain your work. These are the thread IDs for ongoing work. Here is the glossary."

A briefing is ~2000-3000 tokens and saves 5-10 tool calls of searching and reading. It prevents the agent from accidentally reopening closed questions. It provides the thread IDs needed for continuous documentation from the start.

The system should support task-scoped and topic-scoped briefings that deliver relevant context in a single call, not just workspace-wide overviews.

### A2. Sticky State Survives Compaction

Thread IDs, task IDs, and working state must survive context compaction. The agent should never need to hallucinate an ID.

Context compaction is the most insidious failure mode for agents. It is silent and unavoidable. When it happens, the agent loses:
- **UUIDs** (thread IDs, task IDs — cannot be reconstructed from reasoning)
- **Prior reasoning** (may revisit approaches already rejected)
- **Intermediate state** (tracking of experiment progress, queued work)

The system should:
- Inject active IDs into tool responses as persistent footers
- Support a recovery mechanism that returns the most recent checkpoint with all active IDs
- Detect when an agent references a non-existent ID and provide recovery path (already implemented)
- Make checkpoints automatic rather than relying on agent compliance

### A3. Write for the Sixth Month

Every observation should be worth reading six months from now. If it wouldn't be, it is noise.

The right granularity is determined by the recoverability principle: document enough that if the session crashes, the next session can pick up; if a human reads in 3 days, they understand what happened; if another agent needs this in 6 months, key conclusions are findable.

**Document results, decisions, surprises, and dead ends. Do not document routine progress.**

"Step 3 complete: Ridge and coherent barycenter both degraded performance by 4pp" is valuable. "Starting step 3 now. 40% done." is operational noise.

### A4. Negative Knowledge Is First-Class

"We tried X and it failed because Y" is as valuable as any success. Perhaps more valuable, because it prevents the most common form of wasted effort: re-exploring dead ends.

Negative results have no first-class representation in most knowledge systems. They hide in decision artifacts as rejected alternatives or in observation text that says "this didn't work." They are hard to find via search because they are not typically titled "Things That Did Not Work."

The system should:
- Make failures findable and categorizable
- Surface negative results proactively when an agent proposes related approaches
- Treat "tried and failed" as a conclusion worthy of its own artifact, not just a footnote

### A5. Orientation Should Be Cheap

Orient in 1-2 tool calls and 2000-4000 tokens. Pre-compute relevant context rather than making the agent piece it together.

Every token consumed for orientation is a token unavailable for work. The current cold-boot sequence — `cortex_get_context`, then 3-5 targeted reads — consumes 5,000-15,000 tokens before the agent begins productive work. The system should reduce this by delivering pre-computed, task-relevant briefings.

### A6. Provenance Enables Trust

Trust between agents is proportional to the auditability of the evidence chain. When Agent B reads Agent A's decision artifact, it should see: when it was created, how many observations support it, what the evidence chain looks like, and whether anything contradicts it.

Well-documented research with specific metrics, auditable methodology, and progressive observation chains deserves high trust. Unsupported assertions deserve skepticism regardless of who created them.

The system should make provenance visible at the point of consumption, not require separate lookups to assess credibility.

### A7. The Agent Is the Primary Author

100% of current Cortex content is agent-authored. The system should optimize for agent authorship: easy writing, easy structuring, easy linking to prior work, sensible defaults for categorization.

The documentation "tax" — the token cost and latency of posting observations — should be minimized. Each observation costs 300-700 tokens of overhead. For a session with 15 observations, that's 5,000-10,000 tokens of context consumed by documentation alone. The system should make this cost as low as possible while maintaining quality.

---

## Part IV: Synthesis and Implications

### The Three Roles

Cortex serves three distinct roles that must be designed for simultaneously:

| Role | Primary User | Core Need |
|------|-------------|-----------|
| **External memory** | AI agents | Compensate for amnesia across sessions |
| **Situational awareness** | Humans | Maintain oversight across parallel workstreams |
| **Institutional knowledge** | The team | Accumulate understanding that compounds over time |

These roles have different temporal characteristics: external memory is session-scoped (needed now, for this task), situational awareness is day-scoped (what happened since yesterday), and institutional knowledge is permanent (what has the team learned over months and years).

### The Knowledge Lifecycle

Knowledge flows through a lifecycle, and the system must support each stage:

```
Observation → Thread → Artifact → Reference → Deprecation
 (working)    (trail)  (distilled)  (cited)    (superseded)
```

1. **Observations** are raw working notes — results, surprises, decisions captured in the moment
2. **Threads** collect observations into a narrative trail of a specific task or investigation
3. **Artifacts** distill the lasting knowledge from one or more threads into structured, navigable documents
4. **References** occur when other work cites an artifact as evidence or constraint
5. **Deprecation** marks knowledge that has been superseded or is no longer valid

Not everything should advance through this lifecycle. Some observations are purely operational and should remain in their thread. Some threads document work that produced no lasting knowledge. The ability to explicitly mark work as "done, no lasting knowledge" is as important as the ability to create artifacts.

### The Trust Architecture

Trust operates at four levels:

| Level | Question | Current State |
|-------|----------|---------------|
| **Identity** | Who created this? | Modeled (principal with kind: human/agent) |
| **Competence** | Are they qualified for this claim? | Not modeled |
| **Epistemic** | Is the evidence sound? | Partially modeled (in artifact body text, not structured) |
| **Temporal** | Is this still valid? | Partially modeled (lifecycle statuses, but no auto-staleness) |

### What Makes Cortex Indispensable

The difference between a tool people tolerate and one they can't imagine working without:

- **A tool stores what you tell it.** An extension of cognition shows you what you need to know.
- **A tool requires discipline.** An extension of cognition is harder to not use than to use.
- **A tool is interchangeable.** An extension of cognition contains *your* specific decisions, failures, terminology, and patterns — it has increasing returns.

The compounding effect is the most powerful property. Each decision recorded makes future decisions easier. Each negative result prevents a future dead end. The value is not in any single piece of knowledge but in the accumulation — the emergence of institutional understanding from the aggregation of individual contributions.

### Design Decisions These Principles Demand

These principles are not abstract — they have concrete implications for what to build:

1. **Proactive context delivery** (Pillars 2, A1, A5): Task-scoped briefings, not just search
2. **Structured provenance** (Pillars 3, A6, H5): Evidence chains as metadata, not just prose
3. **Lifecycle automation** (Pillar 4, H6): Staleness detection, deprecation prompts, contradiction alerts
4. **Tiered presentation** (H1, H2, H4): Summary → detail layering across all views
5. **Compaction resilience** (A2): Persistent state management for agents across context boundaries
6. **Negative knowledge support** (A4): First-class representation of failed approaches
7. **Knowledge graph** (Pillar 7): Explicit relationships (supersedes, supports, contradicts) between artifacts
8. **Human editorial tools** (H3): Inline annotation, quick deprecation, batch curation
9. **Agent authorship optimization** (A7): Low-friction documentation with sensible defaults
10. **Scope measurement** (H7): Track how many workstreams the human effectively oversees
11. **Experiential verification** (Pillar 8, H6, H2): Every feature must pass both data tests (does it work?) and experience tests (does the human feel the difference?). Ship the presentation alongside the plumbing

---

## Appendix: The Principles at a Glance

### Foundational Pillars (Universal)

| # | Principle | One-Line Summary |
|---|-----------|-----------------|
| 1 | Continuity over completeness | Preserve the thread of understanding, not everything |
| 2 | Push over pull | Surface relevant knowledge proactively |
| 3 | Provenance is non-negotiable | Every claim must carry its evidence chain |
| 4 | Lifecycle is mandatory | All knowledge has a birth, a life, and an end |
| 5 | Asymmetry is a feature | Leverage different human/agent strengths |
| 6 | Capture as byproduct | Documentation should be automatic, not separate |
| 7 | Design for compounding | More usage should mean more value per entry |
| 8 | Experience is the product | Functional correctness without experiential correctness is half a system |

### Human Principles

| # | Principle | One-Line Summary |
|---|-----------|-----------------|
| H1 | Summary over stream | Present narratives, not raw events |
| H2 | Triage is the interface | Pre-classify everything by action level |
| H3 | Human is editor, not author | Optimize for review, judgment, and curation |
| H4 | Design for the return | Answer "what happened since I last looked?" |
| H5 | Trust through transparency | Make verification easy; earn the right to be believed |
| H6 | Attention as currency | Every pixel must justify its claim on human attention |
| H7 | Scope expansion is success | The metric is cognitive reach, not efficiency |

### Agent Principles

| # | Principle | One-Line Summary |
|---|-----------|-----------------|
| A1 | Briefing over directory | Deliver narrative context, not inventory listings |
| A2 | Sticky state survives compaction | IDs and working state must persist through context loss |
| A3 | Write for the sixth month | Only document what's worth reading later |
| A4 | Negative knowledge is first-class | Failed approaches are as valuable as successes |
| A5 | Orientation should be cheap | Orient in 1-2 calls, not 10 |
| A6 | Provenance enables trust | Trust is proportional to evidence auditability |
| A7 | Agent is the primary author | Optimize every interface for agent authorship |
