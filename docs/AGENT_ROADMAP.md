# Cortex Agent Layer: Design and Roadmap

> Created: February 9, 2026
> Grounded in: `docs/first-principles.md`, `docs/success-criteria.md`, `docs/roadmap.md`
> Prerequisites: Phase 0 (audit fixes) and Phase 1 (organization/navigation) — both complete
> Status: Design document — no code implemented yet

---

## Why an Agent Layer

Phase 0 gave Cortex lifecycle management, audit logs, and editorial tools. Phase 1 added thread summaries, a dashboard, enhanced search, observation sub-types, knowledge links, and comment deduplication. These are structural improvements — plumbing that makes the system functional.

The human's feedback after Phase 1: **"marginal, not major improvement."**

This is honest and diagnostic. Every Phase 0/1 feature works correctly. The data is stored, the APIs respond, the UI renders. But the human's *experience* hasn't fundamentally changed because no feature in Phase 0 or 1 requires intelligence. Thread summaries exist — but only when agents manually write them. The dashboard shows activity — but doesn't interpret it. Search has filters — but doesn't understand queries. The system stores knowledge but doesn't *think* about it.

The agent layer is the mechanism that converts structural assets into experiential assets. It is the transition from Phase 2 (Surface) to Phase 3 (Synthesize) in the roadmap — the point where Cortex stops being a filing cabinet and starts being a cognitive partner.

### What the agent layer provides that structure cannot

1. **Thread summaries that write themselves.** Instead of depending on MCP agents to remember to write summaries when resolving threads, the Scribe generates them automatically. Every resolved thread gets a summary. Every search result becomes more informative. Every dashboard entry becomes actionable.

2. **Skeptical review that catches what humans miss.** When an artifact is created, the Critic reviews it: Are there unsupported claims? Does it contradict existing knowledge? Are the limitations acknowledged? The human doesn't have to read every artifact end-to-end — the Critic pre-screens.

3. **A daily briefing that answers "what happened?"** Instead of the human scanning the dashboard and mentally assembling a narrative, the Scribe produces a morning digest: "Overnight, 3 threads resolved, 1 new decision artifact was created in Domain, and the cold-start research hit a ceiling. The new decision artifact contradicts an earlier finding — review recommended."

4. **Knowledge that connects itself.** The Linker identifies relationships between artifacts that no one explicitly declared. "This artifact about GRU training instability *supports* the architecture ceiling conclusion in the cold-start review."

5. **Eventually: ideas from the intersection of domains.** When the knowledge base is dense enough, the agent layer can identify non-obvious connections across topics — the "spark" that comes from having broad, diverse knowledge.

### Grounding in first principles

| Principle | How the agent layer serves it |
|-----------|------------------------------|
| Pillar 2: Push Over Pull | Agents proactively surface knowledge instead of waiting for search |
| Pillar 7: Design for Compounding | Each review, link, and summary makes the next one more valuable |
| Pillar 8: Experience Is the Product | The human *feels* the difference — briefings, reviews, and digests are tangible |
| H1: Summary Over Stream | The Scribe produces narratives, not raw event lists |
| H4: Design for the Return | The daily digest answers "what happened since I last looked?" |
| H5: Trust Through Transparency | The Critic flags contradictions and unsupported claims |
| A1: Briefing Over Directory | Session handoff briefings deliver narrative context, not inventory |
| A4: Negative Knowledge First-Class | The Critic surfaces dead ends; the Linker connects them |

---

## Part 1: Design Questions Addressed

The user raised six specific questions during the design phase. Here are the answers, grounded in the architecture.

### Q1: Should agents summarize MCP context before returning it?

**Answer: No — don't modify existing MCP tools.**

The current `cortex_get_context` returns structured directory listings (topic names, thread titles with summaries, artifact titles) that are already token-efficient at ~2000-4000 tokens. Wrapping this in an LLM summarization step would add latency ($0.01-0.03 per call), introduce hallucination risk (the LLM might omit a critical thread), and make the output less predictable for MCP agents that depend on the structured format.

Instead, build a separate **"Ask Cortex" feature** (Tier 2, Feature 11) that provides LLM-synthesized answers when deeper understanding is needed. This keeps the tools composable: `cortex_get_context` remains fast and deterministic for orientation, while `Ask Cortex` provides interpretive answers for specific questions.

The distinction matters: orientation ("what exists?") should be fast and exhaustive. Interpretation ("what does it mean?") can be slower and selective.

### Q2: Should there be multiple agent personas?

**Answer: Yes — three personas, one service, one principal.**

Three personas with distinct behavioral profiles:

- **The Scribe** — Summarization, synthesis, digest generation. The persona that produces *narrative output* from structured input. Optimized for concision and clarity.
- **The Critic** — Skeptical review, contradiction detection, quality assessment. The persona that *challenges* existing content. Optimized for thoroughness and adversarial thinking.
- **The Linker** — Knowledge graph enrichment, relationship detection, gap analysis. The persona that *connects* discrete pieces of knowledge. Optimized for pattern recognition.

**Why not three separate systems?** Because they share 90% of infrastructure: API access, token tracking, output routing, cascade prevention, principal identity. The difference is the system prompt and the reasoning/verbosity configuration. One service with three modes is dramatically simpler than three services.

**Why not three separate principals?** Because all AI output should be attributable to a single `cortex-analyst` identity for clean filtering and audit. The persona is identified by tags on the output (e.g., `persona:scribe`, `persona:critic`), not by separate DB identities. This avoids principal sprawl, simplifies auth, and lets the human filter by "all AI output" or by specific persona.

### Q3: Should agents review completed work or respond to active agents? Won't this create bloat?

**Answer: Both, with strict cascade prevention.**

Agents review completed work (primary use case):
- Thread resolves → Scribe generates summary
- Artifact created → Critic reviews for quality
- New artifact → Linker suggests knowledge links

Agents respond to other agent output (limited):
- Scribe produces summary → Critic reviews summary quality (but only for high-value artifacts, not every thread summary)

**Cascade prevention** is the mechanism that prevents bloat. Three layers:

1. **Source tag check**: Before executing, check if the triggering content was created by the same persona. If Scribe output triggers the Scribe, skip. This prevents self-referential loops.

2. **Depth counter**: Every AI job has a `depth` field. Direct triggers (human action or external event) have depth=0. An AI job triggered by another AI job gets depth=parent_depth+1. Maximum depth=1. This means: AI can respond to human/external agent work (depth=0), and AI can do one layer of cross-persona review (depth=1), but AI never responds to AI responses (depth=2 is rejected).

3. **Rate limiter**: Per-persona, per-hour caps. The Scribe can't produce more than 10 summaries per hour. The Critic can't review more than 5 artifacts per hour. This prevents burst scenarios where a batch import triggers an avalanche.

**The bloat concern is valid.** Without these three layers, a single thread resolution could cascade into: summary → review of summary → link suggestion for reviewed summary → review of link suggestion → ∞. The depth counter at max=1 makes this impossible. The worst case is: thread resolves → Scribe summarizes → Critic reviews the summary → stop.

### Q4: Should there be a research agent providing methodology feedback?

**Answer: Deferred to Tier 3 ("Research Program Arc", Feature 20).**

A research methodology agent needs two things the current system lacks:

1. **Knowledge density.** With ~17 artifacts and ~37 threads, there isn't enough documented methodology to meaningfully compare approaches. A methodology feedback agent on a sparse KB would produce generic advice ("consider using cross-validation") rather than specific insights ("the last three attempts at cold-start embedding used cosine similarity — have you considered learned similarity metrics based on the training instability patterns documented in artifact X?").

2. **Cross-domain breadth.** Methodology feedback is most valuable when it draws from diverse domains. One topic (cold-start embeddings) doesn't provide enough methodological diversity. When Cortex has 3+ active topics with 50+ artifacts, methodology patterns become findable.

Tier 1-2 features build the knowledge density required. Auto-summarization fills in thread summaries (more searchable knowledge). Knowledge link suggestion builds the graph (more connections to reason over). Contradiction detection validates existing knowledge (more trustworthy foundation). Once this foundation exists, the Research Program Arc becomes powerful rather than generic.

### Q5: How should GPT-5.3 reasoning effort and verbosity levels be configured?

**Answer: Automated per-persona, per-task selection.**

The GPT-5 family supports two key parameters:
- **`reasoning.effort`**: Controls depth of chain-of-thought reasoning. Options: `minimal`, `low`, `medium`, `high`, `xhigh` (GPT-5.2+).
- **`verbosity`**: Controls output length. Options: `low`, `medium`, `high`.

Configuration per persona:

| Persona | Reasoning Effort | Verbosity | Rationale |
|---------|-----------------|-----------|-----------|
| **Scribe** (summarization) | `low` | `low` | Summaries should be concise. Low reasoning is sufficient for extractive summarization. |
| **Scribe** (daily digest) | `medium` | `medium` | Digest requires synthesis across multiple items. Medium reasoning for prioritization. |
| **Scribe** (topic synthesis) | `high` | `medium` | Cross-thread synthesis requires deep understanding. |
| **Critic** (skeptical review) | `high` | `medium` | Needs deep analysis to find gaps and contradictions. |
| **Critic** (quality gate) | `medium` | `low` | Scoring is more formulaic than free-form review. |
| **Linker** (link suggestion) | `medium` | `low` | Pattern matching across artifacts. Structured output. |
| **Linker** (gap analysis) | `high` | `medium` | Finding what's *missing* requires reasoning about what *should* exist. |

**Model selection strategy:**
- Primary: `gpt-5` — available now, good balance of capability and cost
- Cost-sensitive tasks (auto-tagging, simple link suggestions): `gpt-5-mini`
- Deep reasoning tasks (Critic review, gap analysis): `gpt-5` with reasoning=high, or `gpt-5.3` when API access is available
- Fallback chain: `gpt-5.3` → `gpt-5` → `gpt-5-mini`

**Why not always use the strongest model?** Cost. A Critic review with `gpt-5` at reasoning=high costs ~$0.04-0.08. With `gpt-5.3` at reasoning=xhigh, it would cost ~$0.10-0.20. At 5 reviews/day, that's $0.50-1.00/day vs. $0.20-0.40/day. The marginal quality improvement doesn't justify 2.5x cost for most tasks. Reserve the expensive model for tasks where deep reasoning actually changes the output.

**GPT-5.3 availability note:** As of February 2026, GPT-5.3-Codex is released (coding-focused) but the general GPT-5.3 API access is "planned once safely enabled." The architecture uses a provider abstraction layer that makes model swapping a configuration change, not a code change. Start with `gpt-5`, upgrade to `gpt-5.3` when available.

### Q6: Can multiple agents with diverse personas create "the spark of new ideas from broad domain knowledge"?

**Answer: Yes — this is the Tier 3 vision. But it requires prerequisites.**

The "spark" — a non-obvious insight born from connecting knowledge across domains — is the highest-value output an AI agent layer can produce. It's the moment where the cold-start embedding research informs an unrelated signal evaluation methodology, or where a deployment failure pattern reveals a data quality issue that explains an anomalous research result.

This requires:

1. **Knowledge density**: At least 50 artifacts across 3+ topics. Currently at ~17 artifacts in ~2 topics. Sparse knowledge produces generic connections.

2. **Knowledge graph**: Explicit relationships between artifacts. The Linker (Tier 1) builds this graph. Without it, cross-domain connection requires the LLM to hold and compare large contexts — expensive and unreliable.

3. **Negative knowledge**: Documented failures and dead ends. These are often the most fertile ground for cross-domain insight ("this failed in domain A for reason X — does reason X apply in domain B?").

4. **Trust in the agent layer**: The human must trust AI-generated insights enough to act on them. This trust is built through Tier 1 (summaries are accurate, reviews are useful) and Tier 2 (contradiction detection catches real problems).

**The feature: Cross-Domain Sparks (Tier 3, Feature 15).** All three personas collaborate:
- Linker identifies potential cross-domain connections based on shared concepts, methods, or failure modes
- Scribe synthesizes the connection into a readable insight
- Critic evaluates whether the connection is substantive or superficial

Output is a weekly or on-demand "Sparks" digest: 2-3 potential connections with evidence, posted as observations on relevant threads. The human reviews and acts on (or dismisses) each spark.

**Timeline:** Tier 3 features activate when the knowledge base reaches density thresholds. Cross-Domain Sparks requires 50+ artifacts and 3+ active topics. At current growth rate, this is 3-6 months away.

---

## Part 2: The Agent Team

### One Service, Three Personas

The agent layer is implemented as a single `packages/ai/` module with three behavioral modes. This is not three separate systems — it's one execution engine with three system prompts and three configuration profiles.

```
┌─────────────────────────────────────────────┐
│                packages/ai/                 │
│                                             │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐    │
│  │  Scribe  │  │  Critic  │  │  Linker  │    │
│  │ persona  │  │ persona  │  │ persona  │    │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘    │
│       │              │              │          │
│  ┌────▼──────────────▼──────────────▼────┐   │
│  │         Execution Runner              │   │
│  │  (context assembly → LLM call →       │   │
│  │   output routing → telemetry)         │   │
│  └───────────────────────────────────────┘   │
│                                             │
│  ┌───────────────┐  ┌──────────────────┐   │
│  │ Provider       │  │ Cascade          │   │
│  │ Abstraction    │  │ Prevention       │   │
│  │ (OpenAI/etc)   │  │ (depth, rate)    │   │
│  └───────────────┘  └──────────────────┘   │
└─────────────────────────────────────────────┘
```

### The Scribe

**Role:** Transforms raw knowledge into readable narratives. The persona that makes Cortex's knowledge *accessible*.

**Behavioral profile:**
- Voice: Clear, concise, factual. No hedging. No filler. Every sentence carries information.
- Approach: Extractive first (pull key facts from source material), then synthesize (connect facts into a narrative).
- Failure mode to guard against: Producing summaries that are too generic. "Work was completed" is a failed summary. "Investigated 5 aggregation approaches; all degraded R@50 by 2-4pp from the 15.37% baseline" is a useful summary.

**System prompt core:**
```
You are the Scribe for the Cortex knowledge base. Your job is to produce
clear, concise summaries and briefings from raw knowledge.

Rules:
- Every sentence must carry information. No filler, no hedging.
- Include specific metrics, dates, and artifact/thread references.
- Prefer concrete outcomes over process descriptions.
- A good summary lets someone skip reading the source material.
- A bad summary makes them want to read the source material to understand what you meant.
```

**Configuration:**
- Default reasoning: `low`
- Default verbosity: `low`
- Per-task overrides in the feature specs below

**Assigned features:** Thread Auto-Summarization (1), Daily Digest (2), Session Handoff Briefing (6), Observation Triage (9), Topic Synthesis (10), Ask Cortex Q&A (11), Thread Resolution Prompt (13), Proactive Context Injection (19)

### The Critic

**Role:** Challenges existing knowledge for quality, consistency, and completeness. The persona that makes Cortex's knowledge *trustworthy*.

**Behavioral profile:**
- Voice: Direct, specific, evidence-based. Points to concrete problems, not vague concerns.
- Approach: Adversarial — actively look for what's wrong, missing, or unsupported. Assume claims are wrong until proven right.
- Failure mode to guard against: Being generically critical. "This could be more detailed" is useless feedback. "Section 3 claims R@50=15.37% but doesn't specify the evaluation split — was this on validation or test set?" is actionable.

**System prompt core:**
```
You are the Critic for the Cortex knowledge base. Your job is to find
problems: unsupported claims, contradictions with existing knowledge,
missing limitations, and gaps in reasoning.

Rules:
- Every criticism must be specific and actionable.
- Reference existing artifacts/threads when pointing out contradictions.
- Distinguish between "this is wrong" and "this is incomplete."
- If you find nothing wrong, say so explicitly — don't invent problems.
- A good review makes the author want to improve their work.
- A bad review makes them want to ignore you.
```

**Configuration:**
- Default reasoning: `high`
- Default verbosity: `medium`
- Per-task overrides in the feature specs below

**Assigned features:** Skeptical Review (3), Artifact Quality Gate (5), Contradiction Detection (7), Negative Knowledge Surfacing (16), Research Program Arc (20), Debate Mode (21)

### The Linker

**Role:** Discovers relationships between knowledge artifacts. The persona that makes Cortex's knowledge *compound*.

**Behavioral profile:**
- Voice: Structured, precise, relationship-focused. Outputs are often lists of links with brief justifications.
- Approach: Pattern matching — look for shared concepts, methods, results, or failure modes across artifacts. Compare new content against the existing knowledge graph.
- Failure mode to guard against: Suggesting obvious or trivial connections. "Both artifacts mention cold-start" is a useless link. "Both artifacts test cosine similarity for embedding quality but reach opposite conclusions — the 2024 review found it effective while the 2026 experiments show degradation under temporal shift" is a valuable connection.

**System prompt core:**
```
You are the Linker for the Cortex knowledge base. Your job is to find
meaningful relationships between artifacts: supports, contradicts,
supersedes, depends_on, related_to.

Rules:
- Only suggest relationships that would change how someone reads the target.
- Include a 1-sentence justification for each link.
- Prefer "contradicts" and "supersedes" over "related_to" — specific relationships are more valuable than vague associations.
- If two artifacts share a keyword but not a meaningful relationship, do not suggest a link.
```

**Configuration:**
- Default reasoning: `medium`
- Default verbosity: `low`
- Per-task overrides in the feature specs below

**Assigned features:** Knowledge Link Suggestion (4), Staleness Detection (8), Auto-Tagging (12), Gap Analysis (17)

### Communication Model

All agent output flows through Cortex. There is no direct agent-to-agent communication.

```
Trigger Event (thread resolved, artifact created, schedule, manual)
    │
    ▼
AI Execution Runner
    │
    ├──→ Creates observation on relevant thread
    │    (tagged with persona:scribe/critic/linker)
    │
    ├──→ Updates thread summary (Scribe auto-summarization)
    │
    ├──→ Creates knowledge links (Linker suggestions)
    │
    └──→ Logs to ai_jobs table (telemetry)
```

The human reviews AI output through:
- **Dashboard "AI Activity" section** — shows recent AI actions with persona tags
- **Thread detail page** — AI observations appear alongside human/agent comments, visually distinguished by persona tag badges
- **Artifact detail page** — Critic reviews appear as linked observations

AI output is never hidden. Every observation, link, and summary produced by the agent layer is visible, attributed, and filterable.

### Identity and Attribution

- **One DB principal**: `cortex-analyst` (kind='agent', trust_tier=1)
- **Persona tagging**: Every AI observation includes a tag identifying the persona (`persona:scribe`, `persona:critic`, `persona:linker`)
- **Job tracking**: Every AI invocation creates an `ai_jobs` record with: persona, input context, output, tokens used, cost, depth, timing

This design lets users:
- Filter all AI output: `WHERE creator = cortex-analyst`
- Filter by persona: `WHERE tags @> '{persona:critic}'`
- Audit costs: `SELECT SUM(cost_usd) FROM ai_usage WHERE persona = 'critic'`

---

## Part 3: Feature Catalog

### Tier 1 — Foundation

These features deliver immediate, tangible value. They are the foundation that makes the human *feel* the agent layer working.

---

#### Feature 1: Thread Auto-Summarization

**Persona:** Scribe
**Trigger:** Thread status changes to `resolved`
**Input:** Thread title, body, all comments (observations and replies)
**Output:** 1-3 sentence summary written to the thread's `summary` field
**Reasoning effort:** `low`
**Verbosity:** `low`

**How it works:**
1. Event fires: `thread.status_changed` with new_status='resolved'
2. Cascade check: Was this thread resolved by cortex-analyst? If yes, skip (prevent self-trigger)
3. Context assembly: Fetch thread with all comments
4. LLM call: "Summarize this thread's key outcome in 1-3 sentences. Include specific metrics, decisions, or conclusions. Do not include process descriptions."
5. Write summary: `PATCH /v1/threads/:id { summary: "..." }`
6. Log: Create ai_jobs record

**Example input (abbreviated):**
```
Thread: "Cold-Start Embedding: GRU Training Stability Analysis"
Body: "Investigating whether GRU-based sequence models can improve..."
Comments:
  - [observation] "Initial GRU training shows loss divergence at epoch 15..."
  - [observation] "Reduced learning rate to 1e-4, training stabilized but R@50 dropped to 12.1%..."
  - [decision] "GRU approach abandoned. Training instability makes it unsuitable..."
```

**Example output:**
```
GRU-based sequence models for cold-start embeddings show training instability
(loss divergence at epoch 15 with default LR). Reduced learning rate stabilizes
training but degrades R@50 to 12.1% (vs. 15.37% baseline). Approach abandoned.
```

**Cost per invocation:** ~$0.01-0.02 (low reasoning, short output, ~500-1000 input tokens)
**Monthly estimate:** 2-5 threads resolved/day × 30 days = 60-150 invocations = $0.60-3.00/month

**Principles served:** H1 (Summary Over Stream), A1 (Briefing Over Directory), Pillar 8 (Experience), SC4 (Cognitive Reach), SC9 (Indispensable)

**Why this is Tier 1:** Thread summaries already exist as a field (Phase 1) but depend on MCP agents manually writing them. Auto-summarization makes every resolved thread searchable and scannable without relying on agent discipline. It's the single highest-ROI feature because it improves dashboard, search, get_context, and human scanning simultaneously.

---

#### Feature 2: Daily Digest

**Persona:** Scribe
**Trigger:** Scheduled — once daily (configurable time, default 7:00 AM local)
**Input:** All activity since last digest (or since `last_seen_at` if no prior digest)
**Output:** Structured briefing posted as an observation on a dedicated "Daily Digest" thread, also available via API endpoint
**Reasoning effort:** `medium`
**Verbosity:** `medium`

**How it works:**
1. Scheduled trigger fires at configured time
2. Fetch dashboard data: summary stats, needs_attention items, recent_completions, knowledge_base_health
3. Fetch resolved threads with summaries from the period
4. Fetch new artifacts from the period
5. LLM call: "Produce a daily briefing from this activity data. Lead with what matters most. Group by topic. Highlight contradictions, surprises, and items needing attention."
6. Post as observation on the digest thread
7. Optionally: store structured digest for the API/dashboard to render

**Example output:**
```
## Daily Digest — Feb 9, 2026

**Headlines:**
- Cold-start research hit definitive architecture ceiling at R@50=15.37% (confirmed across 2 rounds)
- 1 new decision artifact created in Domain — review recommended (contradicts earlier assessment)
- 3 threads resolved overnight, 2 new threads opened

**By Topic:**

### Domain (Cold-Start Embeddings)
- Thread "V2 Analyst Feedback Final Results" resolved: All 5 tested priorities failed to improve baseline.
  Multi-seed validation confirms ceiling. Temporal split: R@50=11.29% (4pp degradation on newer titles).
- New artifact: "V2 Analyst Feedback Final Results" — **review recommended**: references analyst
  feedback priorities but analyst credentials not documented in KB.

### Architecture
- Thread "Phase 1 Implementation Complete" resolved: 6 features shipped across full stack.
- Dashboard, search, and observation sub-types now operational.

**Knowledge Base Health:**
- 22 artifacts (19 accepted, 0 deprecated, 3 unreviewed)
- 54 threads (12 open, 38 resolved, 4 archived)
- 0 stale threads (open > 7 days with no activity)
```

**Cost per invocation:** ~$0.03-0.06 (medium reasoning, medium output, ~2000-4000 input tokens)
**Monthly estimate:** 1/day × 30 = 30 invocations = $0.90-1.80/month

**Principles served:** H1 (Summary Over Stream), H4 (Design for the Return), H6 (Attention as Currency), SC4 (Cognitive Reach), SC9 (Indispensable)

**Why this is Tier 1:** This is the feature that creates the daily habit. The human opens Cortex → reads the digest → knows what happened → acts on flagged items → marks as reviewed. Without this, the human scans raw dashboard data and mentally assembles the narrative. With this, the narrative is pre-assembled. This is the biggest experiential leap in the entire agent layer.

---

#### Feature 3: Skeptical Review

**Persona:** Critic
**Trigger:** New artifact created (status changes to `accepted`)
**Input:** Full artifact (title, body, summary, tags, references), plus related artifacts from the same topic
**Output:** Review observation posted on the artifact's discussion thread
**Reasoning effort:** `high`
**Verbosity:** `medium`

**How it works:**
1. Event fires: `artifact.created` or `artifact.status_changed` to 'accepted'
2. Cascade check: depth=0 (only review artifacts from humans/external agents, not AI output)
3. Context assembly: Fetch the artifact, fetch up to 5 related artifacts from the same topic
4. LLM call with Critic persona: "Review this artifact. Look for: unsupported claims, contradictions with the provided related artifacts, missing limitations, unstated assumptions, gaps in reasoning. If the artifact is well-written and complete, say so."
5. Post review as observation on the artifact's discussion thread (tagged `persona:critic`, `sub_type:decision`)

**Example output:**
```
## Skeptical Review

**Overall:** Solid methodology documentation. Three issues:

1. **Unsupported scope claim (Section 2):** States "all practical approaches have been
   exhausted" but only 5 specific approaches were tested. Ensemble methods, transformer-based
   architectures, and domain-adapted pre-training are not addressed. Recommend narrowing the
   claim to "all tested approaches within the current architecture."

2. **Missing temporal context:** R@50=15.37% is reported as a ceiling, but the temporal split
   (Section 5) shows R@50=11.29% for newer titles — a 4pp degradation. This suggests the
   ceiling may be architecture-specific rather than problem-inherent. The distinction matters
   for future work decisions.

3. **No issues with methodology or evidence chain.** The 36-experiment evidence base with
   multi-seed validation is thorough. FMB regression and placebo test are appropriate.

**Recommendation:** Minor revision to narrow scope claims. Core conclusions are well-supported.
```

**Cost per invocation:** ~$0.04-0.08 (high reasoning, medium output, ~3000-6000 input tokens for artifact + related context)
**Monthly estimate:** 1-3 artifacts/day × 30 = 30-90 invocations = $1.20-7.20/month

**Principles served:** H5 (Trust Through Transparency), Pillar 3 (Provenance), SC3 (Knowledge Stays Trustworthy), SC8 (Every Claim Has Evidence)

**Why this is Tier 1:** Trust is the immune system of the knowledge base. Without skeptical review, the human must read every artifact to assess quality — an unsustainable time commitment. With it, the Critic pre-screens, highlighting only the issues that need attention. This is the feature that makes artifact auto-accept safe at scale.

---

#### Feature 4: Knowledge Link Suggestion

**Persona:** Linker
**Trigger:** New artifact created
**Input:** New artifact, plus all existing artifacts (titles and summaries only, for token efficiency)
**Output:** Observation on the artifact's discussion thread listing suggested links with justifications
**Reasoning effort:** `medium`
**Verbosity:** `low`

**How it works:**
1. Event fires: `artifact.created`
2. Context assembly: Fetch new artifact (full body). Fetch all existing artifacts (title + summary only, ~100 tokens each)
3. LLM call with Linker persona: "Identify meaningful relationships between this new artifact and existing artifacts. Only suggest relationships that would change how someone reads either artifact. Include link_type and a 1-sentence justification."
4. Post suggestions as observation on the artifact's discussion thread (tagged `persona:linker`)
5. Optionally: auto-create the links if confidence is high (configurable)

**Example output:**
```
## Suggested Knowledge Links

1. **contradicts** → "Cold-Start Embedding: Pre-Audit Signal Assessment" (artifact abc123)
   — The pre-audit assessment rated ATH-FREQ as a potential alpha source. This artifact's
   post-audit analysis concludes it is not. The contradiction should be explicit.

2. **supersedes** → "Cold-Start Embedding: Complete Review Steps 1-7" (artifact def456)
   — This V2 results artifact extends and supersedes the earlier review with additional
   analyst-recommended experiments.

3. **supports** → "Architecture Ceiling Confirmation" (artifact ghi789)
   — The temporal split degradation (R@50 4pp drop for newer titles) provides additional
   evidence for the architecture ceiling hypothesis.
```

**Cost per invocation:** ~$0.02-0.04 (medium reasoning, low output, ~2000-4000 input tokens)
**Monthly estimate:** 1-3 artifacts/day × 30 = 30-90 invocations = $0.60-3.60/month

**Principles served:** Pillar 7 (Design for Compounding), SC6 (Knowledge Compounds), SC3 (Trustworthy)

**Why this is Tier 1:** Knowledge links are the mechanism for compounding. Phase 1 built the infrastructure (the `knowledge_links` table and MCP tool). But links only get created when someone explicitly declares them. The Linker makes link creation automatic — every new artifact is immediately woven into the knowledge graph.

---

#### Feature 5: Artifact Quality Gate

**Persona:** Critic
**Trigger:** New artifact created (can be combined with Feature 3 in a single invocation)
**Input:** Artifact content
**Output:** Quality score (1-5) with breakdown, posted as observation
**Reasoning effort:** `medium`
**Verbosity:** `low`

**How it works:**
1. Event fires: `artifact.created` (same trigger as Feature 3; can share the LLM call)
2. LLM call with Critic persona: Score the artifact on 5 dimensions:
   - **Completeness** (1-5): Does it cover the topic adequately?
   - **Evidence** (1-5): Are claims supported by data/references?
   - **Clarity** (1-5): Is it readable and well-structured?
   - **Limitations** (1-5): Are limitations and scope explicitly stated?
   - **Actionability** (1-5): Can someone act on this information?
3. Post score breakdown as observation (tagged `persona:critic`, `quality-gate`)

**Example output:**
```
## Quality Gate: 4.2/5

| Dimension     | Score | Note |
|---------------|-------|------|
| Completeness  | 5     | Covers all tested approaches comprehensively |
| Evidence      | 5     | 36 experiments, multi-seed validation, FMB regression |
| Clarity       | 4     | Well-structured but temporal split results could be more prominent |
| Limitations   | 3     | Scope claim is broader than evidence supports (see review) |
| Actionability | 4     | Clear next steps implied but not explicitly stated |
```

**Cost per invocation:** ~$0.01-0.03 (medium reasoning, short structured output)
**Monthly estimate:** Combined with Feature 3, minimal additional cost

**Principles served:** H5 (Trust Through Transparency), Pillar 3 (Provenance), SC3 (Knowledge Stays Trustworthy)

**Why this is Tier 1:** Quality scores let the human quickly triage artifacts. A 4.8/5 artifact doesn't need deep review. A 2.5/5 artifact needs attention. Combined with skeptical review (Feature 3), this creates a two-layer quality assurance system.

---

#### Feature 6: Session Handoff Briefing

**Persona:** Scribe
**Trigger:** API call from MCP tool or manual request
**Input:** Topic ID and/or task description, plus relevant threads, artifacts, and tasks
**Output:** Narrative briefing optimized for agent orientation (2000-3000 tokens)
**Reasoning effort:** `medium`
**Verbosity:** `medium`

**How it works:**
1. API call: `POST /v1/ai/briefing { topic_id, task_description? }`
2. Context assembly: Fetch topic overview, recent threads (with summaries), key artifacts, open tasks, recent negative results
3. LLM call with Scribe persona: "Produce a briefing for an agent about to start work on this topic. Include: current state of play, recent decisions, active constraints, open questions, relevant negative results (what not to try). Reference specific thread and artifact IDs."
4. Return briefing text (synchronous — should complete in <10 seconds)

**Example output:**
```
## Briefing: Cold-Start Embeddings (Domain Topic)

**Current state:** Architecture ceiling confirmed at R@50=15.37% (±0.13%) after two rounds
of experiments. No tested approach has improved on the P2A+P1B baseline.

**Recent decisions:**
- V2 analyst feedback priorities all failed (artifact `abc123`). Key result: temporal split
  shows 4pp degradation for newer titles, suggesting the problem is partially data-temporal,
  not just architectural.
- GRU-based approaches abandoned due to training instability (thread `def456`).

**Do NOT retry:**
- Ridge reconstruction (degraded by 4pp)
- Coherent barycenter aggregation (degraded by 2pp)
- GRU sequence models (training instability)

**Open questions:**
- Is the ceiling architecture-specific or problem-inherent?
- Should we explore transformer-based encoders (not yet tested)?

**Active threads:** None currently open.
**Open tasks:** None.
```

**Cost per invocation:** ~$0.02-0.05 (medium reasoning, medium output, ~2000-4000 input tokens)
**Monthly estimate:** 3-10/day × 30 = 90-300 invocations = $1.80-15.00/month

**Principles served:** A1 (Briefing Over Directory), A5 (Orientation Should Be Cheap), SC1 (No Re-derivation), SC5 (Context Survives Discontinuity)

**Why this is Tier 1:** This is the agent-facing counterpart to the Daily Digest. It transforms the cold-boot experience from "scan directory listings and guess what matters" to "read a pre-computed briefing and start working." It directly prevents the most expensive failure mode: re-derivation of known conclusions.

---

#### Feature 22: Agent Team Dashboard

**Type:** Frontend (no persona — this is infrastructure for human oversight)
**Trigger:** Navigation to `/team` page
**Input:** Persona definitions, ai_config, ai_usage stats, ai_jobs history
**Output:** Interactive page showing the agent team, their roles, activity, and configuration

**What it shows:**

1. **Team Overview** — Card per persona (Scribe, Critic, Linker) showing:
   - Name, role description, avatar/icon
   - System prompt (expandable — the human should see exactly what each persona is instructed to do)
   - Current configuration: model, reasoning effort, verbosity, rate limits
   - Status: enabled/disabled, circuit breaker state
   - Activity stats: jobs completed today/this week/this month, tokens used, cost

2. **Configuration Panel** — Per-persona settings the human can adjust:
   - Enable/disable individual personas
   - Adjust rate limits (per-hour, per-day token caps)
   - Change model selection (gpt-5-mini / gpt-5 / gpt-5.3)
   - Adjust reasoning effort and verbosity
   - Set auto-trigger preferences (e.g., auto-review only for decision artifacts)

3. **Global Settings** — Workspace-level AI configuration:
   - Monthly budget cap
   - Daily digest time
   - Master enable/disable toggle
   - Cascade depth limit

4. **Activity Log** — Filterable table of recent AI jobs:
   - Persona, feature, status, trigger source, tokens, cost, duration
   - Click to view job input/output
   - Filter by persona, status, date range

5. **Usage Dashboard** — Visual cost and usage tracking:
   - Cost over time chart (daily/weekly/monthly)
   - Token usage by persona
   - Budget burn rate with projection
   - Per-feature usage breakdown

**Why this is Tier 1:**

This is not optional infrastructure — it's the trust mechanism. Pillar 8 (Experience Is the Product) demands that AI features are not just functionally correct but *visible* and *controllable*. The human needs to:

- **See their team** — Who is the Scribe? What does it do? What are its instructions? This transforms the AI layer from an opaque black box into a team the human understands and directs.
- **Control their team** — If the Critic is too noisy, turn down its rate limit. If summarization quality is poor, change the model. The human is the executive (H3: Human Is Editor, Not Author) — they need executive controls.
- **Trust their team** — Transparency builds trust (H5). Seeing the system prompt, the activity log, and the cost breakdown demystifies the AI layer. The human knows exactly what each persona does, how often it acts, and what it costs.
- **Monitor their team** — The usage dashboard answers "is this worth the cost?" with data. If the Scribe produces summaries but nobody reads them, the human can see that and disable it.

**Implementation notes:**
- API: `GET /v1/ai/team` returns persona definitions + stats
- API: `PATCH /v1/ai/config` already exists for settings changes
- API: `GET /v1/ai/jobs` already exists for activity log
- API: `GET /v1/ai/usage` already exists for usage stats
- Frontend: New page at `/team` with tab sections (Overview, Configuration, Activity, Usage)
- Route registered in App.tsx, nav item added to sidebar

**Principles served:** H5 (Trust Through Transparency), H3 (Human Is Editor), H6 (Attention as Currency), Pillar 8 (Experience), SC9 (Indispensable)

---

### Tier 2 — Intelligence

These features require the Tier 1 foundation. They make the agent layer smarter, not just faster.

---

#### Feature 7: Contradiction Detection

**Persona:** Critic
**Trigger:** Scheduled (weekly), or on-demand via API
**Input:** All accepted artifacts (titles, summaries, and bodies)
**Output:** List of detected contradictions posted as observations on relevant threads
**Reasoning effort:** `high`
**Verbosity:** `medium`

**How it works:**
1. Scheduled trigger (weekly) or manual API call
2. Context assembly: Fetch all accepted artifacts. For token efficiency, start with titles + summaries only. If the LLM identifies potential contradictions, fetch full bodies for those specific pairs.
3. LLM call with Critic persona: "Compare these artifacts. Identify any contradictions — places where two artifacts make claims that cannot both be true. For each contradiction, cite both artifacts and explain the conflict."
4. For each contradiction found: Post observation on both artifacts' discussion threads, suggest a `contradicts` knowledge link

**Minimum knowledge base threshold:** Requires at least 10 accepted artifacts. Below this, contradictions are unlikely and the cost isn't justified.

**Cost per invocation:** ~$0.05-0.15 (high reasoning, large context window, multi-step)
**Monthly estimate:** 4 runs/month = $0.20-0.60/month

**Principles served:** H5 (Trust Through Transparency), Pillar 4 (Lifecycle), SC3 (Trustworthy), SC6 (Knowledge Compounds)

---

#### Feature 8: Staleness Detection

**Persona:** Linker
**Trigger:** Scheduled (weekly)
**Input:** All accepted artifacts with creation dates, last-referenced dates, and topic activity
**Output:** List of potentially stale artifacts posted as observation on topic threads
**Reasoning effort:** `medium`
**Verbosity:** `low`

**Detection criteria (heuristic + LLM):**
- Artifact older than 30 days with no references from newer content
- Artifact in a topic with significant recent activity that doesn't cite it
- Artifact with claims that might be affected by newer findings

**Minimum knowledge base threshold:** Requires at least 15 accepted artifacts and 60+ days of history.

**Cost per invocation:** ~$0.02-0.05
**Monthly estimate:** 4 runs/month = $0.08-0.20/month

**Principles served:** Pillar 4 (Lifecycle), SC3 (Trustworthy)

---

#### Feature 9: Observation Triage

**Persona:** Scribe
**Trigger:** Scheduled (daily), or when a thread accumulates 10+ observations
**Input:** Thread with many observations
**Output:** Triaged summary: key findings, decisions, open questions, negative results — posted as pinned observation
**Reasoning effort:** `medium`
**Verbosity:** `medium`

**When it activates:** Threads that accumulate many observations become hard to parse. An agent session might produce 15 observations in a single thread. The Scribe triages them into categories (results, decisions, negative results, open questions) and produces a structured summary.

**Cost per invocation:** ~$0.02-0.04
**Monthly estimate:** 5-15 threads/month = $0.10-0.60/month

**Principles served:** H1 (Summary Over Stream), H2 (Triage Is the Interface), SC4 (Cognitive Reach)

---

#### Feature 10: Topic Synthesis

**Persona:** Scribe
**Trigger:** On-demand via API, or scheduled monthly
**Input:** All threads and artifacts in a topic
**Output:** Executive summary of the topic's current state of knowledge (1-2 pages)
**Reasoning effort:** `high`
**Verbosity:** `medium`

**How it works:** Cross-thread synthesis that produces a narrative summary of everything known about a topic. Not a list of threads — a coherent story. "The cold-start embedding research began with cooccurrence-based approaches, progressed through analyst-recommended priorities, and concluded with a confirmed architecture ceiling..."

**Minimum knowledge base threshold:** Requires at least 5 resolved threads and 3 artifacts in the topic.

**Cost per invocation:** ~$0.05-0.10 (high reasoning, large context, substantial output)
**Monthly estimate:** 2-4 topics × 1/month = $0.10-0.40/month

**Principles served:** H1 (Summary Over Stream), Pillar 7 (Compounding), SC4 (Cognitive Reach)

---

#### Feature 11: Ask Cortex Q&A

**Persona:** Scribe
**Trigger:** Manual — API call or UI button
**Input:** Natural language question + relevant knowledge base context (assembled via search)
**Output:** Answer with citations to specific artifacts and threads
**Reasoning effort:** `medium` to `high` (depending on question complexity)
**Verbosity:** `medium`

**How it works:**
1. User submits question: "What do we know about cold-start embedding performance?"
2. Context assembly: Search Cortex for relevant threads and artifacts. Assemble top 10 results.
3. LLM call with Scribe persona: "Answer this question using only the provided knowledge base context. Cite specific artifacts and threads. If the knowledge base doesn't contain the answer, say so."
4. Return answer with citations

This is the feature that replaces MCP context summarization (Q1 above). It's separate from `cortex_get_context` because it's interpretive, not structural.

**Cost per invocation:** ~$0.02-0.06
**Monthly estimate:** 5-20 questions/day × 30 = 150-600 invocations = $3.00-36.00/month (highly variable based on usage)

**Principles served:** Pillar 2 (Push Over Pull), A5 (Orientation Should Be Cheap), SC1 (No Re-derivation)

---

#### Feature 12: Auto-Tagging

**Persona:** Linker
**Trigger:** New thread or artifact created
**Input:** Content title and body, plus existing tag taxonomy (all unique tags currently in use)
**Output:** Suggested tags, applied automatically or suggested for review
**Reasoning effort:** `low`
**Verbosity:** `low`

**How it works:** Compares new content against existing tags and suggests the most relevant ones. Normalizes tag format (lowercase, hyphenated). Prevents tag proliferation by preferring existing tags over new ones.

**Cost per invocation:** ~$0.005-0.01 (low reasoning, minimal output — use gpt-5-mini)
**Monthly estimate:** 5-15 items/day × 30 = 150-450 invocations = $0.75-4.50/month

**Principles served:** Pillar 7 (Compounding), SC6 (Knowledge Compounds)

---

#### Feature 13: Thread Resolution Prompt

**Persona:** Scribe
**Trigger:** Thread open > 7 days with no comments in the last 3 days
**Input:** Thread title, body, recent comments
**Output:** Gentle nudge observation: "This thread has been open for X days. Based on the last activity, it appears the work is [complete/stalled]. Consider resolving with a summary, or posting an update."
**Reasoning effort:** `low`
**Verbosity:** `low`

**Cost per invocation:** ~$0.005-0.01
**Monthly estimate:** 5-10 threads/month = $0.025-0.10/month

**Principles served:** Pillar 4 (Lifecycle), SC3 (Trustworthy)

---

### Tier 3 — Synthesis

These features require knowledge density (50+ artifacts, 3+ topics) and established trust in the agent layer.

---

#### Feature 14: Semantic Search via Embeddings

**Type:** Infrastructure (not persona-specific)
**Trigger:** Content creation (for indexing), search queries (for retrieval)
**Input:** Text content → embedding vector
**Output:** Similarity-based search results

**How it works:** Generate embedding vectors for all artifacts and thread summaries using OpenAI's embedding API. Store in a pgvector column. Search queries are embedded and compared via cosine similarity. This enables "find things like this" and "find things related to this concept" queries that full-text search can't handle.

**Why Tier 3:** At current scale (~20 artifacts), PostgreSQL full-text search with the existing ts_rank scoring is sufficient. Embedding search becomes valuable when the knowledge base is large enough that keyword-based search misses conceptual connections.

**Cost:** ~$0.0001 per embedding (text-embedding-3-small). Negligible even at scale.
**Monthly estimate (indexing):** 10-30 new items/day × 30 = $0.03-0.09/month
**Monthly estimate (queries):** 20-100 queries/day × 30 = $0.06-0.30/month

**Principles served:** SC1 (No Re-derivation), Pillar 2 (Push Over Pull)

---

#### Feature 15: Cross-Domain Sparks

**Persona:** All three collaborate
**Trigger:** Scheduled (weekly), or on-demand
**Input:** All artifacts across all topics
**Output:** 2-3 non-obvious cross-domain connections with evidence and analysis

**How it works:**
1. Linker identifies potential cross-domain connections (shared methods, failure modes, or concepts across different topics)
2. Scribe synthesizes each connection into a readable insight
3. Critic evaluates whether each connection is substantive or superficial
4. Post surviving insights as a "Weekly Sparks" digest

**Minimum knowledge base threshold:** 50+ artifacts across 3+ topics.

**This is the "create the spark of new ideas from broad domain knowledge" feature.** It only works with knowledge density. Below the threshold, connections would be either obvious or forced.

**Cost per invocation:** ~$0.10-0.25 (multi-step, high reasoning, large context)
**Monthly estimate:** 4 runs/month = $0.40-1.00/month

**Principles served:** Pillar 7 (Compounding), SC6 (Knowledge Compounds), H7 (Scope Expansion)

---

#### Feature 16: Negative Knowledge Surfacing

**Persona:** Critic
**Trigger:** New thread created, or when an observation mentions a concept that has associated negative results
**Input:** New content + related negative results from the knowledge base
**Output:** Proactive warning: "Note: a related approach was tried and failed — see [thread/artifact]"

**How it works:** When new content is created that relates to a documented negative result, the Critic proactively surfaces the dead end. This directly prevents re-exploration of failed approaches.

**Minimum knowledge base threshold:** Requires enough documented negative results (tagged with `negative-result`) to be useful. Estimate: 10+ tagged negative results.

**Cost per invocation:** ~$0.01-0.03
**Monthly estimate:** 5-15/month = $0.05-0.45/month

**Principles served:** A4 (Negative Knowledge First-Class), SC2 (Dead Ends Visible), SC1 (No Re-derivation)

---

#### Feature 17: Gap Analysis

**Persona:** Linker
**Trigger:** Scheduled (monthly), or on-demand per topic
**Input:** All artifacts and threads in a topic
**Output:** List of identified gaps — "areas where knowledge is expected but not documented"

**How it works:** The Linker examines the knowledge graph for a topic and identifies:
- Concepts referenced but never documented
- Decisions referenced as "TBD" or "future work"
- Methods mentioned in negative results that haven't been tried
- Dependencies between artifacts where the depended-on artifact doesn't exist

**Minimum knowledge base threshold:** 15+ artifacts in a topic.

**Cost per invocation:** ~$0.03-0.08
**Monthly estimate:** 2-4 topics × 1/month = $0.06-0.32/month

**Principles served:** Pillar 7 (Compounding), SC6 (Knowledge Compounds)

---

#### Feature 18: Knowledge Health Dashboard AI

**Persona:** All three
**Trigger:** Monthly or on-demand
**Input:** Full knowledge base statistics + random sample of artifacts
**Output:** "State of the Knowledge Base" report: health metrics, trends, recommendations

**How it works:** Combines quantitative metrics (artifact count, link density, staleness ratio, contradiction count) with qualitative analysis (random sample of artifacts assessed for quality). Produces actionable recommendations for curation.

**Cost per invocation:** ~$0.10-0.20
**Monthly estimate:** 1/month = $0.10-0.20/month

**Principles served:** Pillar 4 (Lifecycle), H6 (Attention as Currency), SC3 (Trustworthy)

---

#### Feature 19: Proactive Context Injection

**Persona:** Scribe
**Trigger:** Agent calls `cortex_get_context` or `cortex_search`
**Input:** Query context + knowledge base
**Output:** Enhanced response with proactively surfaced relevant context

**How it works:** When an MCP agent orients to a topic, the system identifies potentially relevant knowledge that the agent didn't search for — recent decisions, contradictions, negative results — and injects it into the response. This is the "push over pull" principle realized.

**Implementation note:** This could modify MCP tool responses or be a separate tool. The separate tool approach (Feature 6: Session Handoff Briefing) is less invasive and already covers most of the value. Full proactive injection requires tighter integration.

**Minimum knowledge base threshold:** 30+ artifacts.

**Cost per invocation:** ~$0.01-0.03
**Monthly estimate:** 10-30/day × 30 = $3.00-27.00/month (only activated at scale)

**Principles served:** Pillar 2 (Push Over Pull), A1 (Briefing Over Directory), SC1 (No Re-derivation)

---

#### Feature 20: Research Program Arc

**Persona:** Critic
**Trigger:** On-demand, or when a research topic reaches a milestone (e.g., 10 resolved threads)
**Input:** Full thread history for a topic, including all observations and artifacts
**Output:** Methodology review: what approaches were taken, what worked, what didn't, what patterns emerge, what methodology changes should be considered

**How it works:** The Critic examines the arc of a research program and provides meta-level feedback: "Across 12 experiments, you've consistently used cosine similarity. Have you considered learned similarity metrics? The training instability issue in GRU experiments might indicate..." This is where cross-domain knowledge creates actionable methodology suggestions.

**Minimum knowledge base threshold:** 10+ resolved threads in a topic, 50+ artifacts across all topics.

**Cost per invocation:** ~$0.10-0.20 (high reasoning, large context)
**Monthly estimate:** 1-2/month = $0.10-0.40/month

**Principles served:** Pillar 7 (Compounding), H7 (Scope Expansion), SC6 (Knowledge Compounds)

---

#### Feature 21: Debate Mode

**Persona:** Critic + Scribe
**Trigger:** Manual — human requests debate on a specific decision
**Input:** Decision artifact or proposed approach
**Output:** Structured pro/con analysis with evidence from the knowledge base

**How it works:**
1. Human selects a decision and requests debate
2. Scribe presents the "pro" case — arguments and evidence supporting the decision
3. Critic presents the "con" case — arguments, risks, and alternatives
4. Output is a structured debate document with both sides represented

This is the formalized version of the Critic's adversarial role. Instead of reviewing passively, it actively argues against a position to stress-test it.

**Cost per invocation:** ~$0.06-0.15 (two LLM calls, high reasoning for Critic)
**Monthly estimate:** 2-5/month = $0.12-0.75/month

**Principles served:** H5 (Trust Through Transparency), Pillar 3 (Provenance), SC8 (Evidence Trail)

---

### Rejected Features

These were considered and explicitly excluded. The reasoning is documented here so future developers don't re-propose them without addressing the original concerns.

#### Agent-to-Agent Direct Chat
**What:** Agents communicate with each other directly, not through Cortex observations.
**Why rejected:** Creates unauditable communication. All knowledge in Cortex is visible, searchable, and attributed. Direct agent chat would create a shadow channel invisible to humans. The entire trust architecture depends on all knowledge flowing through the auditable system.

#### Automated Artifact Creation
**What:** AI agents create artifacts without human involvement.
**Why rejected:** Too much trust. Artifacts are the permanent, polished knowledge of the system. Auto-accept already works for MCP agents (external, with specific task context). Letting the AI layer auto-create artifacts risks polluting the knowledge base with AI-generated content that has no human oversight at any stage. AI should draft, suggest, and enrich — not create authoritative artifacts.

#### Sentiment Analysis
**What:** Analyze the "sentiment" of observations and threads.
**Why rejected:** No use case. Knowledge systems traffic in facts, not feelings. An observation that says "GRU training diverges" doesn't need sentiment analysis — it needs to be categorized as a negative result. The observation sub-type system (Phase 1) already handles this structurally.

#### Auto Thread Creation
**What:** AI automatically creates new threads based on detected topics or patterns.
**Why rejected:** Noise risk. Thread creation is a meaningful act — it declares "this is a distinct line of investigation." Automating it would create threads for every tangential observation. Humans and MCP agents should create threads deliberately; AI should enrich existing threads.

#### Content Rewriting
**What:** AI rewrites or improves existing observations and artifacts.
**Why rejected:** Violates provenance. Every piece of content should reflect what the original author wrote. AI enrichment (summaries, reviews, links) adds *new* content alongside the original, never replaces it. Rewriting would break the audit trail and undermine trust.

---

## Part 4: Technical Architecture

### Package Structure

```
packages/ai/
├── src/
│   ├── index.ts                    # Module entry point, exports
│   ├── config.ts                   # AI configuration (models, budgets, thresholds)
│   │
│   ├── providers/
│   │   ├── types.ts                # Provider abstraction interface
│   │   └── openai.ts              # OpenAI GPT-5 implementation
│   │
│   ├── personas/
│   │   ├── types.ts                # Persona interface
│   │   ├── scribe.ts              # Scribe system prompt, config
│   │   ├── critic.ts              # Critic system prompt, config
│   │   └── linker.ts              # Linker system prompt, config
│   │
│   ├── context/
│   │   └── assembler.ts           # Context assembly per persona and task
│   │
│   ├── execution/
│   │   ├── runner.ts              # Runs persona against assembled context
│   │   ├── circuit-breaker.ts     # Failure detection, exponential backoff
│   │   └── cascade.ts            # 3-layer cascade prevention
│   │
│   ├── output/
│   │   └── router.ts             # Routes AI output to Cortex (observations, summaries, links)
│   │
│   └── telemetry/
│       └── usage.ts              # Token tracking, cost calculation, budget enforcement
│
├── package.json
└── tsconfig.json
```

### Provider Abstraction

The provider interface is deliberately minimal — text-in, text-out with configuration:

```typescript
interface LLMProvider {
  complete(request: CompletionRequest): Promise<CompletionResponse>;
}

interface CompletionRequest {
  model: string;
  system: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  reasoning?: { effort: 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' };
  verbosity?: 'low' | 'medium' | 'high';
  max_tokens?: number;
  temperature?: number;
}

interface CompletionResponse {
  content: string;
  input_tokens: number;
  output_tokens: number;
  model: string;
}
```

**Why minimal?** Because we need one thing: send a prompt, get a response, track tokens. We don't need function calling, streaming, or multi-modal capabilities for this use case. A minimal interface means:
- Easy to swap providers (OpenAI → Anthropic → local model)
- Easy to mock for testing
- No framework lock-in

### Database Schema (Migration 004)

```sql
-- AI job tracking
CREATE TABLE ai_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id),
    persona VARCHAR(64) NOT NULL,          -- 'scribe', 'critic', 'linker'
    feature VARCHAR(64) NOT NULL,          -- 'auto-summarize', 'skeptical-review', etc.
    status VARCHAR(32) NOT NULL DEFAULT 'queued',  -- queued, running, completed, failed
    input JSONB NOT NULL,                  -- trigger context (thread_id, artifact_id, etc.)
    output JSONB,                          -- result (summary text, review text, links suggested)
    error TEXT,                            -- error message if failed
    depth SMALLINT NOT NULL DEFAULT 0,     -- cascade depth (0 = direct trigger, 1 = AI-triggered)
    tokens_used INTEGER,
    cost_usd NUMERIC(10, 6),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ
);

CREATE INDEX idx_ai_jobs_workspace ON ai_jobs(workspace_id);
CREATE INDEX idx_ai_jobs_status ON ai_jobs(status);
CREATE INDEX idx_ai_jobs_persona ON ai_jobs(persona);
CREATE INDEX idx_ai_jobs_created ON ai_jobs(created_at DESC);

-- Token usage tracking (one row per LLM call)
CREATE TABLE ai_usage (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id),
    job_id UUID REFERENCES ai_jobs(id),
    persona VARCHAR(64) NOT NULL,
    model VARCHAR(128) NOT NULL,
    input_tokens INTEGER NOT NULL,
    output_tokens INTEGER NOT NULL,
    cost_usd NUMERIC(10, 6) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ai_usage_workspace ON ai_usage(workspace_id);
CREATE INDEX idx_ai_usage_created ON ai_usage(created_at DESC);

-- AI configuration per workspace
CREATE TABLE ai_config (
    workspace_id UUID PRIMARY KEY REFERENCES workspaces(id),
    enabled BOOLEAN NOT NULL DEFAULT true,
    monthly_budget_usd NUMERIC(10, 2) NOT NULL DEFAULT 50.00,
    daily_digest_time TIME DEFAULT '07:00',
    auto_summarize BOOLEAN NOT NULL DEFAULT true,
    auto_review BOOLEAN NOT NULL DEFAULT true,
    auto_link BOOLEAN NOT NULL DEFAULT true,
    config JSONB DEFAULT '{}'::jsonb,      -- persona-specific overrides
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### API Endpoints

```
POST   /v1/ai/summarize/:threadId    — Trigger thread summarization (sync, <30s)
POST   /v1/ai/review/:artifactId     — Trigger artifact review (sync, <60s)
GET    /v1/ai/digest                  — Get latest daily digest (sync)
POST   /v1/ai/digest/generate         — Trigger digest generation (async, returns job_id)
POST   /v1/ai/briefing                — Generate session briefing (sync, <30s)
POST   /v1/ai/ask                     — Ask a question (sync, <30s)
GET    /v1/ai/jobs                    — List AI jobs (pagination, filtering)
GET    /v1/ai/jobs/:id                — Get job status and result
GET    /v1/ai/usage                   — Usage statistics (tokens, cost, by persona)
GET    /v1/ai/config                  — Get AI configuration
PATCH  /v1/ai/config                  — Update AI configuration
```

**Sync vs. async pattern:**
- Simple operations (summarize, briefing, ask) respond synchronously with a 60-second timeout. These typically complete in 5-15 seconds.
- Complex operations (digest generation, contradiction detection) return a job_id immediately. The client polls `GET /v1/ai/jobs/:id` for completion.

### Event System

Application-level EventEmitter in the API service layer. No message queue — overkill at this scale.

```typescript
// In thread.service.ts, after status update:
if (newStatus === 'resolved' && oldStatus !== 'resolved') {
  eventBus.emit('thread.resolved', { threadId, workspaceId });
}

// In artifact.service.ts, after creation:
eventBus.emit('artifact.created', { artifactId, workspaceId, creatorKind });

// In packages/ai/src/events/listener.ts:
eventBus.on('thread.resolved', async ({ threadId, workspaceId }) => {
  if (!aiConfig.auto_summarize) return;
  await cascadeCheck('scribe', 'auto-summarize', threadId);
  await runner.execute('scribe', 'auto-summarize', { threadId });
});
```

**Why EventEmitter over a message queue?** Because:
- Single process, single server. No distributed coordination needed.
- Events are fire-and-forget with error handling in the listener. If AI fails, the thread still resolves.
- Zero infrastructure dependency. No Redis, no RabbitMQ, no SQS.
- If Cortex scales to multiple servers, migrate to a shared event bus then. Premature infrastructure adds complexity without value.

### Cascade Prevention (Detailed)

```typescript
async function cascadeCheck(
  persona: string,
  feature: string,
  targetId: string
): Promise<boolean> {
  // Layer 1: Source tag check
  // Was the triggering content created by the same persona?
  const trigger = await getTriggerContent(targetId);
  if (trigger.tags?.includes(`persona:${persona}`)) {
    log.info(`Cascade prevented: ${persona} triggered by own output`);
    return false; // Skip
  }

  // Layer 2: Depth check
  // Was this triggered by another AI job?
  const parentJob = await getParentAiJob(targetId);
  const depth = parentJob ? parentJob.depth + 1 : 0;
  if (depth > 1) {
    log.info(`Cascade prevented: depth ${depth} exceeds max 1`);
    return false; // Skip
  }

  // Layer 3: Rate limit
  // Has this persona exceeded its hourly cap?
  const recentCount = await countRecentJobs(persona, '1 hour');
  const hourlyLimit = PERSONA_LIMITS[persona]; // scribe: 20, critic: 10, linker: 15
  if (recentCount >= hourlyLimit) {
    log.info(`Cascade prevented: ${persona} rate limit (${recentCount}/${hourlyLimit})`);
    return false; // Skip
  }

  return true; // Proceed
}
```

### Token Budget Management

Three levels of budget enforcement:

1. **Per-invocation**: Each feature has a max_tokens cap. If the LLM produces more tokens than allocated, the output is truncated. Prevents runaway responses.

2. **Per-persona-per-day**: The Scribe gets 50,000 tokens/day. The Critic gets 30,000 tokens/day. The Linker gets 20,000 tokens/day. If the daily cap is reached, remaining jobs are queued for the next day.

3. **Per-workspace-per-month**: Hard cap (default $50/month). When reached, all AI features are disabled until the next billing period or the admin raises the cap. Dashboard shows a warning when 80% consumed.

```typescript
async function checkBudget(persona: string, estimatedTokens: number): Promise<boolean> {
  // Per-invocation check
  if (estimatedTokens > FEATURE_TOKEN_LIMITS[feature]) {
    return false;
  }

  // Daily persona check
  const dailyUsage = await getDailyTokenUsage(persona);
  if (dailyUsage + estimatedTokens > DAILY_PERSONA_LIMITS[persona]) {
    return false;
  }

  // Monthly workspace check
  const monthlySpend = await getMonthlySpend(workspaceId);
  const estimatedCost = estimateTokenCost(estimatedTokens, model);
  if (monthlySpend + estimatedCost > workspaceConfig.monthly_budget_usd) {
    return false;
  }

  return true;
}
```

### Circuit Breaker

If the OpenAI API fails, the circuit breaker prevents cascading failures:

```
State: CLOSED (normal operation)
  → 3 consecutive failures → State: OPEN
    → All AI requests immediately return "AI temporarily unavailable"
    → After 60 seconds → State: HALF-OPEN
      → Allow 1 test request
      → If success → CLOSED
      → If failure → OPEN (double the wait: 120s, 240s, max 15 min)
```

All AI features are **optional**. When the circuit breaker is open:
- Thread resolution still works (no summary generated)
- Artifact creation still works (no review generated)
- Dashboard still works (no digest, raw data shown)
- The system is degraded, not broken

---

## Part 5: Implementation Phasing

### Phase A: Infrastructure

**Prerequisites:** Phase 0 and Phase 1 complete (they are).

**Deliverables:**
1. Create `packages/ai/` package skeleton with TypeScript configuration
2. Database migration 004: `ai_jobs`, `ai_usage`, `ai_config` tables
3. Provider abstraction interface + OpenAI implementation
4. Create `cortex-analyst` principal (kind='agent', trust_tier=1)
5. Execution runner with job tracking
6. Cascade prevention (3-layer system)
7. Circuit breaker
8. Token budget management
9. EventEmitter hooks in thread.service.ts and artifact.service.ts
10. API routes: `/v1/ai/jobs`, `/v1/ai/usage`, `/v1/ai/config`, `/v1/ai/team`
11. Feature 22: Agent Team Dashboard — `/team` page with persona cards, configuration panel, activity log, and usage dashboard. Ships with infrastructure because the human needs to see and control the AI layer from day one.

**Verification:**
- `ai_jobs` table exists and accepts inserts
- OpenAI provider connects and returns completions
- Cascade prevention rejects depth > 1
- Circuit breaker opens after 3 failures, recovers after success
- Budget enforcement prevents overspend
- `/team` page renders with all 3 persona cards, shows empty activity log, displays configuration controls

**Rollback:** Drop migration 004, remove `packages/ai/`, revert EventEmitter hooks.

---

### Phase B: The Scribe Launches

**Prerequisites:** Phase A complete.

**Deliverables:**
1. Scribe persona definition (system prompt, config)
2. Feature 1: Thread Auto-Summarization
   - Context assembler for threads (fetch thread + comments)
   - Output router: write to thread.summary field
   - Event listener: `thread.resolved` → trigger
3. Feature 2: Daily Digest
   - Context assembler for dashboard data
   - Output router: post as observation on digest thread
   - Scheduled trigger (configurable time)
4. API endpoints: `POST /v1/ai/summarize/:threadId`, `GET /v1/ai/digest`, `POST /v1/ai/digest/generate`
5. Frontend: "Summarize" button on thread page, digest section on dashboard

**Verification:**
- Resolve a thread → summary appears within 30 seconds
- Digest generates and appears on dashboard
- Budget tracking shows correct token/cost records
- Manual trigger via API works

---

### Phase C: The Critic Launches

**Prerequisites:** Phase B complete (Scribe operational).

**Deliverables:**
1. Critic persona definition (system prompt, config)
2. Feature 3: Skeptical Review
   - Context assembler for artifacts + related artifacts
   - Output router: post as observation on artifact discussion thread
   - Event listener: `artifact.created` → trigger
3. Feature 5: Artifact Quality Gate
   - Scoring rubric in system prompt
   - Combined with Feature 3 in single LLM call
4. API endpoint: `POST /v1/ai/review/:artifactId`
5. Frontend: "Review" button on artifact page, review badges

**Verification:**
- Create an artifact → review + quality score appear on discussion thread within 60 seconds
- Review identifies specific issues (not generic feedback)
- Cascade prevention: Critic doesn't review AI-generated observations

---

### Phase D: The Linker Launches

**Prerequisites:** Phase B complete (Scribe operational).

**Deliverables:**
1. Linker persona definition (system prompt, config)
2. Feature 4: Knowledge Link Suggestion
   - Context assembler for new artifact + existing artifact summaries
   - Output router: post suggestions as observation, optionally auto-create links
   - Event listener: `artifact.created` → trigger
3. Feature 6: Session Handoff Briefing
   - Context assembler for topic-scoped briefing
   - API endpoint: `POST /v1/ai/briefing`
4. Frontend: Briefing view for agents/humans

**Verification:**
- Create an artifact → link suggestions appear within 30 seconds
- Suggestions reference specific artifacts with justifications
- Briefing endpoint returns narrative context in <10 seconds

---

### Phase E: Tier 2 Features

**Prerequisites:** All three personas operational (Phases B-D). Knowledge base has 20+ artifacts.

**Priority order within Tier 2:**
1. Ask Cortex Q&A (Feature 11) — highest human value, builds on Scribe
2. Contradiction Detection (Feature 7) — highest trust value, builds on Critic
3. Auto-Tagging (Feature 12) — lowest cost, builds on Linker
4. Observation Triage (Feature 9) — improves thread readability
5. Topic Synthesis (Feature 10) — requires 5+ resolved threads per topic
6. Staleness Detection (Feature 8) — requires 60+ days of history
7. Thread Resolution Prompt (Feature 13) — simple nudge feature

---

### Phase F: Tier 3 Features

**Prerequisites:** Tier 2 operational. Knowledge base has 50+ artifacts across 3+ topics. Agent layer has been operational for 60+ days.

**Priority order within Tier 3:**
1. Semantic Search (Feature 14) — infrastructure for other Tier 3 features
2. Negative Knowledge Surfacing (Feature 16) — requires tagged negative results
3. Gap Analysis (Feature 17) — requires dense knowledge graph
4. Cross-Domain Sparks (Feature 15) — the ultimate vision
5. Research Program Arc (Feature 20) — requires extensive research history
6. Proactive Context Injection (Feature 19) — deep integration
7. Knowledge Health Dashboard AI (Feature 18) — nice-to-have
8. Debate Mode (Feature 21) — on-demand feature, implement when requested

---

## Part 6: Cost Analysis

### Per-Feature Cost Estimates

| Feature | Reasoning | Est. Tokens/Call | Cost/Call | Frequency | Monthly Cost |
|---------|-----------|-----------------|-----------|-----------|-------------|
| 1. Auto-Summarize | low | 500-1000 | $0.01-0.02 | 60-150/mo | $0.60-3.00 |
| 2. Daily Digest | medium | 2000-4000 | $0.03-0.06 | 30/mo | $0.90-1.80 |
| 3. Skeptical Review | high | 3000-6000 | $0.04-0.08 | 30-90/mo | $1.20-7.20 |
| 4. Link Suggestion | medium | 2000-4000 | $0.02-0.04 | 30-90/mo | $0.60-3.60 |
| 5. Quality Gate | medium | (combined with #3) | — | — | — |
| 6. Handoff Briefing | medium | 2000-4000 | $0.02-0.05 | 90-300/mo | $1.80-15.00 |

**Tier 1 total estimate:** $5.10-30.60/month

The range is wide because Feature 6 (Handoff Briefing) cost depends heavily on usage frequency. If agents request briefings 3 times/day, it's $1.80/month. If 10 times/day, it's $15/month.

### Tier 2 Additional Costs

| Feature | Monthly Cost |
|---------|-------------|
| 7. Contradiction Detection | $0.20-0.60 |
| 8. Staleness Detection | $0.08-0.20 |
| 9. Observation Triage | $0.10-0.60 |
| 10. Topic Synthesis | $0.10-0.40 |
| 11. Ask Cortex Q&A | $3.00-36.00 |
| 12. Auto-Tagging | $0.75-4.50 |
| 13. Resolution Prompt | $0.03-0.10 |

**Tier 2 additional estimate:** $4.26-42.40/month

Ask Cortex Q&A dominates because it's demand-driven. Heavy usage could be expensive.

### Budget Guardrails

| Level | Cap | Effect |
|-------|-----|--------|
| Per-invocation | Feature-specific max_tokens | Truncates output |
| Per-persona-per-day | Scribe: 50K, Critic: 30K, Linker: 20K tokens | Queues remaining jobs |
| Per-workspace-per-month | $50 (configurable) | Disables AI features |
| Alert threshold | 80% of monthly budget | Dashboard warning |

### Model Selection Impact on Cost

| Model | Relative Cost | Use For |
|-------|--------------|---------|
| gpt-5-mini | 1x (baseline) | Auto-tagging, resolution prompts, simple suggestions |
| gpt-5 | ~5x | Most features: summarization, review, briefing |
| gpt-5 (high reasoning) | ~10x | Skeptical review, contradiction detection, gap analysis |
| gpt-5.3 (when available) | ~8-15x | Deep analysis tasks (Critic with high reasoning) |

Starting with gpt-5 for most tasks and gpt-5-mini for high-volume/low-complexity tasks is the cost-optimal approach. Upgrade individual features to gpt-5.3 when it becomes available and when the quality improvement justifies the cost.

---

## Part 7: Skeptical Review

This section takes a critical, adversarial look at the agent layer design. For each concern, we ask: "What if this goes wrong?" and "Is the mitigation sufficient?"

### 1. OpenAI API Downtime

**Concern:** The entire agent layer depends on a single external API. If OpenAI is down, all AI features fail.

**Mitigation:** Circuit breaker with exponential backoff. All AI features are optional — the system degrades gracefully. Thread resolution still works (no summary), artifact creation still works (no review), dashboard still works (raw data, no digest).

**Assessment:** Sufficient. OpenAI's API reliability is >99.5%. The circuit breaker prevents cascading failures during the rare downtime. The key principle: AI features enhance Cortex; they never block it.

### 2. Hallucinated Summaries

**Concern:** The Scribe might generate summaries that misrepresent the thread content. A hallucinated metric or inverted conclusion could propagate through the knowledge base.

**Mitigation:**
- All AI output is attributed (tagged `persona:scribe`) and visible
- The Critic reviews Scribe output for high-value artifacts
- Summaries are shown alongside the full thread content, not as a replacement
- The human can edit or clear any summary

**Assessment:** Partially sufficient. The real risk is a subtly wrong summary that the human doesn't catch because it looks plausible. Mitigation: the Scribe prompt explicitly instructs "include specific metrics and decisions" — this makes hallucinations easier to spot (a wrong number is more detectable than a wrong framing). But there's no automated validation. **Recommendation:** Add a confidence score to summaries. Summaries with low confidence get flagged for review.

### 3. Infinite Agent Loops

**Concern:** AI output triggers AI output which triggers AI output. An artifact review triggers a link suggestion which triggers another review...

**Mitigation:** Three-layer cascade prevention:
- Source tag check: Same persona doesn't respond to own output
- Depth counter: Max depth = 1
- Rate limiter: Per-persona hourly caps

**Assessment:** Sufficient. The depth counter alone prevents infinite loops. The worst case with max_depth=1 is: human creates artifact → Critic reviews → Linker suggests links → stop. Three AI invocations from one human action. At ~$0.08 per invocation, that's $0.24 — acceptable.

### 4. Cost Overruns

**Concern:** A batch import or busy day triggers hundreds of AI invocations, blowing through the budget.

**Mitigation:** Three-level budget enforcement (per-invocation, per-persona-per-day, per-workspace-per-month). Hard monthly cap. Dashboard warning at 80%.

**Assessment:** Sufficient. The monthly hard cap is the final safety net. Even if the per-invocation and daily limits fail (bug), the monthly cap stops spending. The admin can adjust the cap or disable specific features.

**But:** What about the first month? The system needs a reasonable default monthly cap that's low enough to prevent surprise bills but high enough to be useful. $50/month is the proposed default. At current scale, projected spend is $5-30/month. The $50 cap provides 2-10x headroom.

### 5. Small Knowledge Base Problem

**Concern:** With only ~20 artifacts and ~50 threads, many features will produce low-quality output. Contradiction detection on 20 artifacts won't find much. Cross-domain sparks with 2 topics will be forced.

**Mitigation:** Minimum knowledge base thresholds per feature. Features don't activate until the KB is dense enough to produce useful output.

| Feature | Minimum Threshold |
|---------|------------------|
| Contradiction Detection | 10 artifacts |
| Staleness Detection | 15 artifacts, 60 days |
| Topic Synthesis | 5 resolved threads per topic |
| Cross-Domain Sparks | 50 artifacts, 3 topics |
| Gap Analysis | 15 artifacts per topic |

**Assessment:** Sufficient. The thresholds prevent premature activation. Tier 1 features (summarization, review, link suggestion) work well even on small knowledge bases because they operate on individual items, not cross-item analysis.

### 6. Large Knowledge Base Scaling

**Concern:** When the KB grows to 500+ artifacts, context assembly will exceed token limits. You can't fit 500 artifact summaries into one LLM call.

**Mitigation:** Context windowing:
- For cross-artifact features (contradiction detection, sparks): Use search to pre-filter relevant artifacts, then send only the top N to the LLM
- For per-item features (summarization, review): Context is naturally bounded (one thread, one artifact)
- For embedding-based features (Tier 3): Embeddings scale linearly with content, search is O(n) on vector comparison

**Assessment:** Sufficient for projected scale (2-3 years). At 500 artifacts with ~200 tokens per summary, that's 100K tokens — still within GPT-5's context window. Beyond that, embedding-based pre-filtering keeps LLM context manageable.

### 7. Quality Degradation: Who Reviews the Critic?

**Concern:** The Critic reviews the Scribe's output. But who reviews the Critic's reviews? If the Critic produces low-quality reviews, the human might stop trusting AI output entirely.

**Mitigation:** The human reviews the Critic. This is the correct answer — the human is the final authority (H3: Human Is Editor, Not Author). The dashboard surfaces AI activity with persona tags, making Critic reviews easy to find and assess.

**Assessment:** Partially sufficient. The risk is that the human doesn't review Critic output because there's too much of it. **Recommendation:** Quality metrics. Track how often the human acts on Critic feedback (edits the artifact, adds a response, dismisses the review). If the dismissal rate exceeds 80%, the Critic's prompts need adjustment.

### 8. Echo Chamber Risk

**Concern:** The AI layer reinforces existing beliefs in the knowledge base. The Scribe summarizes the consensus. The Critic reviews against the consensus. The Linker connects things that confirm the consensus. No one challenges the frame.

**Mitigation:** The Critic persona is designed adversarially. Its system prompt says "assume claims are wrong until proven right." It's not a consensus-seeker; it's a devil's advocate.

**Assessment:** Partially sufficient. An adversarial prompt helps, but an LLM trained on the same data as the KB content may share the same blind spots. The Debate Mode feature (Tier 3, Feature 21) provides a structural remedy — it forces the generation of counter-arguments. But Debate Mode is Tier 3. In Tiers 1-2, the echo chamber risk is real.

**Recommendation:** The Critic prompt should include explicit instructions to consider perspectives *outside* the knowledge base: "What would a skeptic who hasn't read these artifacts say? What alternative explanations exist that this knowledge base doesn't address?"

### 9. Noise vs. Signal

**Concern:** Every thread resolution generates a summary. Every artifact generates a review and link suggestions. The human's dashboard fills with AI output. The agent layer becomes the very noise it was designed to cut through.

**Mitigation:** Frequency caps (1 digest/day, max reviews/day). Quality thresholds (only post link suggestions with confidence > threshold). Persona-specific tagging enables filtering.

**Assessment:** This is the most serious concern. Mitigation exists but may be insufficient. The fundamental tension: AI features that are too conservative feel useless (why bother?), and AI features that are too aggressive feel noisy (too much output to scan).

**Recommendation:** Start conservative. Default to low frequency, high quality thresholds. Let the human adjust upward based on experience. It's easier to turn up the volume than to un-noise a flooded dashboard. Specific defaults:
- Auto-summarize: All resolved threads (high value, low noise)
- Skeptical review: Only for 'decision' and 'procedure' type artifacts (skip 'document' and 'glossary')
- Link suggestions: Only post if 2+ links with high confidence
- Digest: Once daily (never more)

### 10. Model Dependency

**Concern:** The entire agent layer is built on OpenAI. If OpenAI changes pricing, deprecates models, or degrades quality, we're locked in.

**Mitigation:** Provider abstraction layer. The interface is text-in/text-out. Swapping to Anthropic, Google, or a local model requires implementing one interface method.

**Assessment:** Sufficient for pricing and deprecation risk. The abstraction layer makes model swapping a configuration change. Quality degradation is harder to detect — you'd need evaluation benchmarks for each feature, which is Tier 3 work.

**Note on Anthropic:** Claude models could serve any of these personas. The provider abstraction explicitly supports this. The choice to start with OpenAI/GPT-5 is a user preference, not an architectural constraint.

### 11. GPT-5.3 Availability

**Concern:** The design assumes GPT-5.3 features (reasoning effort, verbosity) that may not be available in the API yet. GPT-5.3-Codex is released but general API access is "planned."

**Mitigation:** Fallback chain: gpt-5.3 → gpt-5 → gpt-5-mini. Start implementation with gpt-5, which is available. The `reasoning.effort` parameter is available on gpt-5 (minimal/low/medium/high). `verbosity` is available on gpt-5.2+. `xhigh` reasoning is gpt-5.2+. All critical features work with gpt-5.

**Assessment:** Sufficient. No feature in the entire roadmap *requires* gpt-5.3. It's an optimization, not a dependency.

### 12. Security

**Concern:** AI prompts might contain sensitive information. AI output might contain injected content. The `cortex-analyst` principal might be exploited.

**Mitigation:**
- **Prompt content:** Prompts contain Cortex knowledge base content. If the KB contains secrets, they'll be sent to OpenAI. Phase 1 already includes a secret detector in the comment service (checking for API keys, passwords, etc.). Extend this to AI prompts.
- **Output sanitization:** AI output is written as observations and summaries, which are rendered through the existing Markdown component. No raw HTML injection risk.
- **Principal security:** `cortex-analyst` has trust_tier=1 (contributor). It can create observations and update thread summaries but cannot delete content, change principals, or modify trust tiers. It's a contributor, not an admin.

**Assessment:** Sufficient for the current threat model (single-user, local deployment). If Cortex moves to multi-tenant, additional isolation is needed (per-workspace API keys, per-workspace AI budgets).

---

## Part 8: Success Criteria Alignment

How the agent layer maps to the 9 success criteria from `docs/success-criteria.md`:

### SC1: No Agent Ever Re-Derives a Conclusion That Already Exists

| Feature | Contribution |
|---------|-------------|
| Thread Auto-Summarization (1) | Every resolved thread has a searchable summary → agents find conclusions via search |
| Session Handoff Briefing (6) | Agent orientation includes prior conclusions and negative results |
| Negative Knowledge Surfacing (16) | System proactively warns before re-exploring dead ends |
| Ask Cortex Q&A (11) | Agent can ask "has this been tried?" and get an answer |

**Agent layer impact:** Transforms SC1 from "agent must manually search and piece together prior work" to "system pre-computes and surfaces relevant conclusions."

### SC2: Dead Ends Are Visible Before Someone Walks Into Them

| Feature | Contribution |
|---------|-------------|
| Session Handoff Briefing (6) | Includes "do not retry" section with failed approaches |
| Negative Knowledge Surfacing (16) | Proactive warning when new work relates to a documented failure |
| Observation Triage (9) | Categorizes observations, making negative results easy to find |

### SC3: Knowledge Stays Trustworthy as It Scales

| Feature | Contribution |
|---------|-------------|
| Skeptical Review (3) | Every artifact is reviewed for quality and consistency |
| Artifact Quality Gate (5) | Quantitative quality score for quick triage |
| Contradiction Detection (7) | Systematic identification of conflicting claims |
| Staleness Detection (8) | Flags potentially outdated content |

**Agent layer impact:** Transforms SC3 from "human must read everything to assess quality" to "AI pre-screens and highlights issues."

### SC4: The Human's Cognitive Reach Expands (North Star)

| Feature | Contribution |
|---------|-------------|
| Daily Digest (2) | Morning briefing compresses overnight activity into 2-minute read |
| Topic Synthesis (10) | Executive summary per topic, not per thread |
| Ask Cortex Q&A (11) | Natural language access to accumulated knowledge |
| Cross-Domain Sparks (15) | Insights the human couldn't generate manually |

**Agent layer impact:** This is the primary target. SC4 is the north star metric. The agent layer's most important contribution is expanding what the human can effectively oversee. Without the agent layer, the human reads raw data. With it, they read narratives, reviews, and prioritized insights.

### SC6: Knowledge Compounds

| Feature | Contribution |
|---------|-------------|
| Knowledge Link Suggestion (4) | Every new artifact is automatically woven into the graph |
| Auto-Tagging (12) | Consistent taxonomy enables cross-referencing |
| Gap Analysis (17) | Identifies what's missing, guiding future work |

### SC8: Every Claim Has an Evidence Trail

| Feature | Contribution |
|---------|-------------|
| Skeptical Review (3) | Reviews explicitly check for unsupported claims |
| Debate Mode (21) | Forces evidence-based argumentation on both sides |

### SC9: Cortex Becomes Harder to Not Use Than to Use

| Feature | Contribution |
|---------|-------------|
| Daily Digest (2) | Creates the daily habit of checking Cortex |
| Skeptical Review (3) | Catches things the human would miss → they trust AI review |
| Session Handoff Briefing (6) | Agents orient faster with briefings → they always request one |
| Auto-Summarization (1) | Every search result has a useful summary → search becomes reliable |

**Agent layer impact:** SC9 is the ultimate test. The agent layer creates three habit loops:
1. **Human daily loop:** Open Cortex → read digest → review flagged items → mark as reviewed
2. **Agent session loop:** Request briefing → work → document → resolve with summary
3. **Knowledge growth loop:** New content → auto-review → auto-link → auto-tag → richer search → better briefings

These loops compound. Each iteration makes the next more valuable.

---

## Part 9: Evaluation Framework

Every feature needs concrete win/loss conditions defined *before* implementation, not after. This section establishes what success and failure look like for each feature, from both the human and agent perspective, with specific measurable indicators and an analysis of compounding effects.

The bar is high. A feature that "works" but doesn't change behavior is a loss. A feature that changes behavior and amplifies other features is a win.

---

### Evaluation Principles

1. **Behavioral change over functional correctness.** The feature works (functional) is table stakes. The feature changes how someone uses Cortex (behavioral) is the real test.

2. **Measure at the outcome, not the output.** "Scribe generated 50 summaries" is output. "Agents reference thread summaries in their first observation 80% of the time" is outcome.

3. **Compounding features get the highest bar.** Features that make other features more valuable must demonstrably do so, or they're dead weight masquerading as infrastructure.

4. **Losses compound too.** A noisy feature doesn't just fail on its own — it trains the human to ignore AI output, which degrades every other feature. Quality failures are systemic, not local.

---

### Tier 1 Evaluations

#### Feature 1: Thread Auto-Summarization

**Human Perspective**

| Condition | What It Looks Like |
|-----------|-------------------|
| **Win** | The human scans the topic page and *understands the outcome of each thread without clicking into it*. They spend 60% less time on thread triage. When they search, the results show summaries that tell them whether to click through — most of the time they don't need to. After 2 weeks, the human says "I can't imagine these without summaries." |
| **Loss** | Summaries are generic ("Work was completed"), factually wrong (hallucinated metrics), or so verbose they don't save time over reading the thread. The human learns to ignore summaries and clicks through anyway. Worse: a wrong summary causes the human to skip a thread they should have read. |

**Agent Perspective**

| Condition | What It Looks Like |
|-----------|-------------------|
| **Win** | When an agent calls `cortex_get_context`, thread summaries provide enough information that the agent can decide which threads are relevant without reading them. Agent orientation drops from 5-10 tool calls to 2-3. Agents reference summaries in their first observation ("Building on the findings summarized in thread X..."). |
| **Loss** | Summaries are too vague for agents to assess relevance. Agents still read full threads to understand outcomes. Orientation cost doesn't decrease. |

**Measurable Indicators:**
- Summary coverage: % of resolved threads with non-empty summaries (target: 95%+)
- Summary quality: % of summaries containing at least one specific metric, decision, or named outcome (target: 80%+)
- Search improvement: click-through rate on search results decreases (users get what they need from the summary)
- Agent orientation: average tool calls before first productive observation decreases by 30%+

**Compounding Impact:**
- **→ Daily Digest (2):** Digest quality is directly proportional to summary quality. Bad summaries → bad digest → human ignores digest → daily habit never forms. This is the highest-leverage dependency in the entire system.
- **→ Search (all):** Every search result becomes more informative. The difference between "Thread: Cold-Start GRU Analysis" and "Thread: Cold-Start GRU Analysis — GRU abandoned due to training instability, R@50 degraded to 12.1%" is the difference between a filing cabinet and a knowledge system.
- **→ Session Handoff Briefing (6):** Briefings pull from summaries. Better summaries → better briefings → faster agent orientation → more productive sessions → better documentation → better summaries. This is the primary compounding loop.
- **→ Ask Cortex Q&A (11):** Q&A retrieves summaries as context. Better summaries → more accurate answers → more trust in Q&A → more usage → more value.

**If this feature fails, it cascades.** Auto-summarization is the keystone. If summaries are low quality, Features 2, 6, 11, and search all degrade. Invest heavily in prompt engineering and quality validation here.

---

#### Feature 2: Daily Digest

**Human Perspective**

| Condition | What It Looks Like |
|-----------|-------------------|
| **Win** | The human checks Cortex every morning because the digest tells them something they couldn't learn faster any other way. They read it in under 2 minutes. They act on 1-3 flagged items. After a month, skipping the digest feels like going to work without checking email. The human says "the digest caught something I would have missed." |
| **Loss** | The digest is a reformatted activity log — same information as the dashboard but in paragraph form. The human reads it once, finds no additional value over the dashboard, and stops reading. Or: the digest is inaccurate, flags things that don't need attention, and the human loses trust. Or: the digest is generic ("3 threads were resolved yesterday") without the *so what*. |

**Agent Perspective**

| Condition | What It Looks Like |
|-----------|-------------------|
| **Win** | N/A — this is a human-facing feature. Indirect agent benefit: the human reviews AI output through the digest, providing implicit quality feedback. |
| **Loss** | N/A |

**Measurable Indicators:**
- Habit formation: % of days the human opens the digest within 2 hours of generation (target: 70%+ after 2 weeks)
- Action rate: % of digests that lead to at least one human action (click-through, review, edit) (target: 50%+)
- Accuracy: % of "needs attention" items that the human agrees needed attention (target: 80%+)
- Time-to-orient: time from digest open to "mark as reviewed" (target: <3 minutes)

**Compounding Impact:**
- **→ Agent Team Dashboard (22):** The digest is the primary touchpoint that drives the human to engage with the AI layer. If the digest is good, the human checks the team page to understand *how* it's working. If the digest is bad, they never visit the team page.
- **→ SC9 (Indispensable):** The daily digest is the habit loop. No other feature creates a daily touchpoint. If the digest fails, the path to SC9 requires the human to *remember* to check Cortex — and they won't.
- **→ Skeptical Review (3):** The digest surfaces Critic reviews. If the digest is good, the human reads reviews. If the digest is ignored, reviews go unread, and the Critic's work is wasted.

**If this feature fails, adoption stalls.** The digest is the difference between "the human checks Cortex daily" and "the human checks Cortex when they remember." The compounding cost of failure is that every downstream feature loses its audience.

---

#### Feature 3: Skeptical Review

**Human Perspective**

| Condition | What It Looks Like |
|-----------|-------------------|
| **Win** | The human reads a Critic review and thinks "good catch — I wouldn't have noticed that." They edit the artifact based on the review. Over time, they trust that reviewed artifacts are higher quality than unreviewed ones. They start to *expect* reviews and feel uneasy about artifacts that don't have them. After 3 months, the Critic has caught at least 5 substantive issues that would have propagated silently. |
| **Loss** | Reviews are generic ("could be more detailed"), point out trivial issues ("consider adding a date"), or hallucinate problems that don't exist. The human dismisses reviews without reading them. Worse: the human edits an artifact based on a wrong review, introducing an error that wasn't there before. |

**Agent Perspective**

| Condition | What It Looks Like |
|-----------|-------------------|
| **Win** | Agents reading reviewed artifacts have higher confidence in the content. The review observation provides meta-information ("evidence chain is strong," "scope claim is broader than evidence") that helps agents calibrate trust. |
| **Loss** | Agents ignore reviews or are confused by contradictions between the review and the artifact. |

**Measurable Indicators:**
- Action rate: % of reviews that lead to artifact edits (target: 20-40% — too low means reviews are useless, too high means artifacts are poor quality or Critic is nitpicking)
- Dismissal rate: % of reviews the human explicitly dismisses or ignores (target: <30%)
- Specificity: % of reviews that reference specific sections, metrics, or claims in the artifact (target: 90%+)
- False positive rate: % of issues raised that the human determines are not actually issues (target: <20%)
- Trust delta: human's self-reported trust in reviewed vs. unreviewed artifacts (qualitative, quarterly survey)

**Compounding Impact:**
- **→ Artifact Quality Gate (5):** Quality scores are only meaningful if the reviews that inform them are trustworthy. Bad reviews → meaningless scores → human ignores scores → quality gate is dead weight.
- **→ Contradiction Detection (7):** The Critic's ability to detect contradictions in Tier 2 depends on the quality standards established by Tier 1 reviews. If the Critic learns to produce specific, evidence-based reviews, contradiction detection inherits that rigor.
- **→ SC3 (Trustworthy at Scale):** This is the immune system. If skeptical review works, the knowledge base stays healthy as it grows. If it fails, quality degrades silently and trust collapses — the "zombie knowledge base" failure mode.

---

#### Feature 4: Knowledge Link Suggestion

**Human Perspective**

| Condition | What It Looks Like |
|-----------|-------------------|
| **Win** | The human navigates to an artifact and sees 3-5 meaningful relationships they didn't create manually. Following links tells a coherent story of how understanding evolved. The human discovers connections they hadn't noticed: "I didn't realize the cold-start ceiling relates to the signal evaluation methodology." The knowledge graph becomes a navigation tool, not just metadata. |
| **Loss** | Links are obvious ("both mention embeddings"), trivial ("both are in the same topic"), or wrong ("links two unrelated artifacts because they share a keyword"). The human stops looking at suggested links. The knowledge graph fills with noise. |

**Agent Perspective**

| Condition | What It Looks Like |
|-----------|-------------------|
| **Win** | Agents searching for an artifact find related artifacts through links. When an agent reads "contradicts: [older artifact]", it immediately understands the epistemic landscape. Link suggestions reduce the number of search queries needed to understand a topic. |
| **Loss** | Agents follow links to irrelevant artifacts, wasting context window. |

**Measurable Indicators:**
- Acceptance rate: % of suggested links that are confirmed (auto-created or manually approved) (target: 60%+)
- Discovery: % of link traversals that lead to engagement with the target artifact (target: 40%+)
- Graph density: average links per artifact increases from 0.5 to 2+ over 3 months
- Relationship specificity: % of links using typed relationships (contradicts, supersedes, supports) vs. generic (related_to) (target: 70%+ typed)

**Compounding Impact:**
- **→ Contradiction Detection (7):** Explicit `contradicts` links are the foundation for systematic contradiction detection. The Linker builds the graph; the Critic analyzes it.
- **→ Cross-Domain Sparks (15):** Sparks require a dense knowledge graph. Every link the Linker adds is a potential pathway for a future cross-domain insight. At 50 artifacts × 2 links each = 100 edges — that's a graph dense enough for meaningful traversal.
- **→ SC6 (Knowledge Compounds):** This is the compounding mechanism itself. Each link makes the graph more navigable, which makes future links more valuable, which makes the graph more navigable. The flywheel only spins if link quality is high.

---

#### Feature 5: Artifact Quality Gate

**Human Perspective**

| Condition | What It Looks Like |
|-----------|-------------------|
| **Win** | The human glances at a quality score and immediately knows whether to deep-review or skim. A 4.5/5 artifact gets a quick scan. A 2.5/5 gets careful attention. Over time, the scoring correlates with the human's own quality assessment at least 75% of the time. Quality scores on the topic page enable prioritized triage across many artifacts. |
| **Loss** | Scores don't correlate with actual quality. A thorough artifact gets 3/5 while a vague one gets 4.5/5. The human loses trust in scores within the first week and ignores them permanently. |

**Measurable Indicators:**
- Correlation: Spearman rank correlation between AI quality score and human-assessed quality (target: ρ > 0.6)
- Calibration: AI scores should distribute normally — not everything is 4+/5 (target: standard deviation > 0.7)
- Triage efficiency: time spent on artifact review decreases by 25%+ after quality gate adoption

**Compounding Impact:**
- **→ All artifact features:** Quality scores are metadata that every artifact-related feature can use. Search can rank by quality. The dashboard can highlight low-quality artifacts. Staleness detection can prioritize review of high-quality artifacts.

---

#### Feature 6: Session Handoff Briefing

**Human Perspective**

| Condition | What It Looks Like |
|-----------|-------------------|
| **Win** | The human reads a briefing and understands the state of a topic in 60 seconds without clicking into any threads or artifacts. When they direct an agent to work on a topic, they can provide informed guidance because the briefing told them what's been tried and what failed. |
| **Loss** | Briefings are generic topic summaries that don't help the human make decisions. |

**Agent Perspective**

| Condition | What It Looks Like |
|-----------|-------------------|
| **Win** | An agent requests a briefing and its first observation references the briefing content: "Per the briefing, Ridge reconstruction has been tried and degraded performance. Proceeding with alternative approach X." The agent never re-proposes an approach documented in the "do not retry" section. Orientation drops from 5,000-15,000 tokens to 2,000-4,000 tokens. |
| **Loss** | The briefing is too generic to be actionable. The agent still makes 5+ search/read calls after the briefing. The agent proposes an approach that the briefing should have warned against. |

**Measurable Indicators:**
- Agent re-derivation rate: % of sessions where agent proposes something documented in "do not retry" (target: <5%, was unmeasured before)
- Orientation cost: tokens consumed before first productive observation (target: 50% reduction)
- Briefing reference rate: % of agent sessions that reference briefing content in first observation (target: 60%+)
- Human usage: % of topic reviews where human requests a briefing (target: 30%+)

**Compounding Impact:**
- **→ Auto-Summarization (1):** Briefings are only as good as the summaries they pull from. This creates positive pressure on summary quality.
- **→ SC1 (No Re-derivation):** The direct prevention mechanism. Every re-derivation prevented is a full session's worth of tokens saved plus the cognitive cost of the human reviewing redundant work.
- **→ Negative Knowledge Surfacing (16):** Briefings that include "do not retry" sections are the lightweight precursor to full negative knowledge surfacing. If briefings work well, Feature 16 is an incremental improvement rather than a new concept.

---

#### Feature 22: Agent Team Dashboard

**Human Perspective**

| Condition | What It Looks Like |
|-----------|-------------------|
| **Win** | The human visits `/team` and immediately understands their AI team: who does what, how active each persona is, what it costs, and how to adjust settings. They feel a sense of *control* — this is their team, configured to their preferences. When the Critic is too aggressive, they adjust its rate limit and see the effect. When they're curious about what the Scribe does, they read the system prompt. The team page is where the AI layer stops being magic and becomes a tool the human directs. After a month, the human has tweaked at least 3 settings based on observed behavior. |
| **Loss** | The page is a wall of configuration options that the human doesn't understand. They visit once, feel overwhelmed, and never return. Or: the page shows stats but offers no actionable controls — the human sees costs but can't adjust behavior. Or: the team page exists but the human doesn't know *why* they'd visit it — it's administrative overhead, not situational awareness. |

**Measurable Indicators:**
- Visit frequency: human visits `/team` at least weekly (target: weekly for first month, then as-needed)
- Configuration changes: at least 3 setting adjustments in the first month (indicates human is actively directing the team)
- Comprehension: human can accurately describe what each persona does without looking at the page (qualitative)
- Cost awareness: human knows their monthly AI spend within 20% accuracy (qualitative)

**Compounding Impact:**
- **→ Every AI feature:** The team page is the governance layer. If the human understands and trusts their AI team, they engage with AI output more seriously. If the AI layer is an opaque box, every piece of AI output gets a discount on credibility.
- **→ SC9 (Indispensable):** A team you understand is a team you rely on. The path to "harder to not use" requires the human to feel *ownership* of the AI layer, not just awareness of it. The team page is where ownership lives.
- **→ Budget management:** Without the team page, cost overruns are invisible until the monthly cap is hit. With it, the human sees the burn rate and can proactively adjust before problems occur.

---

### Tier 2 Evaluations

#### Feature 7: Contradiction Detection

| Perspective | Win | Loss |
|-------------|-----|------|
| **Human** | Discovers a real contradiction between two artifacts they were treating as both true. Resolves it — updates or deprecates one. Says "how did I not notice this?" | Flags false contradictions (two artifacts that seem contradictory out of context but aren't). Human wastes time investigating non-issues. |
| **Agent** | Finds contradictions in the briefing context and can reason about which artifact to trust based on recency and evidence quality. | Confused by flagged contradictions that are actually complementary perspectives. |

**Measurable:** True positive rate >70%. At least 1 real contradiction found per quarter in a 20+ artifact KB. Human resolves flagged contradictions within 1 week.

**Compounding:** Every resolved contradiction makes the knowledge base more consistent → every downstream feature that reads the KB becomes more reliable. One unresolved contradiction pollutes every briefing, search result, and review that touches either artifact.

---

#### Feature 8: Staleness Detection

| Perspective | Win | Loss |
|-------------|-----|------|
| **Human** | Gets a nudge about an artifact they'd forgotten. Reviews it, discovers it's outdated, updates or deprecates it. The knowledge base stays current without requiring the human to remember what exists. | Gets flagged about an artifact that's still perfectly valid. Learns to ignore staleness alerts. |
| **Agent** | Encounters fewer stale artifacts during search and orientation. Trust in retrieved artifacts is higher. | No measurable improvement in artifact freshness because the human ignores alerts. |

**Measurable:** Deprecated artifact count increases from 0 to 5+ within 3 months of activation. False staleness rate <30%.

**Compounding:** Stale artifacts degrade every read operation. One stale artifact in a briefing undermines the entire briefing's credibility. Active staleness management is the janitorial work that keeps the compounding engine clean.

---

#### Feature 9: Observation Triage

| Perspective | Win | Loss |
|-------------|-----|------|
| **Human** | Opens a thread with 20 observations and immediately sees the structured triage: 3 key results, 1 decision, 2 negative results, 1 open question. Reads the triage in 30 seconds instead of scanning 20 observations in 5 minutes. | Triage misses a critical observation or miscategorizes a result as a negative result. Human still reads all observations to verify. |
| **Agent** | Reads the triage observation and gets a structured summary of the thread's state without processing all observations. Faster thread comprehension during orientation. | Triage is too lossy — agent misses important nuance because it wasn't in the triage summary. |

**Measurable:** Thread comprehension time (time from thread open to meaningful action) decreases by 40%+ for threads with 10+ observations. Triage accuracy: >85% of observations correctly categorized.

**Compounding:** Triaged threads are easier to summarize (Feature 1), review (Feature 3), and brief from (Feature 6). Every Tier 1 feature that reads thread content benefits from pre-triaged observations.

---

#### Feature 10: Topic Synthesis

| Perspective | Win | Loss |
|-------------|-----|------|
| **Human** | Reads a 1-page synthesis and understands an entire topic's knowledge arc without reading any individual threads. Can brief a colleague (or a new project) on the topic in 3 minutes. | Synthesis is a list of thread summaries stitched together — no narrative, no insight, no arc. The human could have gotten the same information from the topic page. |
| **Agent** | Uses topic synthesis as the primary orientation document. Understands not just what was done but how understanding evolved. | Synthesis is too compressed — loses important nuance that the agent needs for its work. |

**Measurable:** Synthesis quality: human rates synthesis as "would share with a colleague" >70% of the time. Agent orientation: sessions that start with synthesis reference it in 80%+ of cases.

**Compounding:** Topic syntheses are the highest-level summaries in the system. They feed directly into Cross-Domain Sparks (15) — the Linker compares topic syntheses, not individual artifacts, when looking for cross-domain connections. High-quality topic syntheses make Sparks possible; low-quality ones make them meaningless.

---

#### Feature 11: Ask Cortex Q&A

| Perspective | Win | Loss |
|-------------|-----|------|
| **Human** | Asks "what do we know about temporal degradation in cold-start models?" and gets a precise, cited answer in 10 seconds. Finds information they forgot existed. Asks follow-up questions. Uses it 5+ times per week. | Gets vague answers ("there is some research on this topic"), wrong answers (hallucinated artifacts), or answers that miss relevant knowledge. Uses it once, loses trust, never returns. |
| **Agent** | Asks targeted questions during orientation instead of doing 5+ search/read cycles. Gets answers with artifact citations that provide direct entry points. | Q&A answers are less reliable than direct search. Agent still uses search as primary orientation. |

**Measurable:** Answer accuracy: >85% of answers cite real, relevant artifacts. Usage: >5 queries/week sustained. Time-to-answer vs. manual search: 3x faster for topic-spanning questions.

**Compounding:** Q&A is the most direct path to SC9 (Indispensable). If it works, the human stops trying to remember where things are and just asks. Each question answered correctly increases the probability of the next question being asked. Each question unanswered or answered wrong decreases the probability of the next 5 questions being asked. The trust curve is exponential in both directions.

---

#### Features 12-13: Auto-Tagging and Thread Resolution Prompt

| Feature | Win | Loss |
|---------|-----|------|
| **12. Auto-Tagging** | Tag taxonomy stays consistent as KB grows. New content is discoverable through existing tags. Zero human effort on tagging. | Tags are wrong, inconsistent, or too generic ("research"). Human spends time correcting auto-tags — net negative. |
| **13. Resolution Prompt** | Stale threads decrease by 30%+. Agents and humans resolve threads they'd forgotten about. Thread list stays navigable. | Annoying nudges on threads that are intentionally left open. Human/agent ignores all nudges, including legitimate ones. |

**Measurable:** Auto-tag acceptance: >75%. Open thread age decreases by 30%. Thread resolution rate improves.

---

### Tier 3 Evaluations

#### Feature 14: Semantic Search

| Perspective | Win | Loss |
|-------------|-----|------|
| **Human** | Searches for a concept ("methods that handle data scarcity") and finds relevant artifacts that keyword search missed. Discovery rate for related knowledge improves significantly. | Semantic search returns vaguely related results ranked above more relevant keyword matches. The human loses trust and switches back to keyword search. |
| **Agent** | Finds prior work based on conceptual similarity, not just keyword overlap. Reduces re-derivation for conceptually similar (but differently-worded) approaches. | False positives waste context window during orientation. |

**Measurable:** Search recall: finds 30%+ more relevant results than keyword search for concept queries. Precision: >70% of semantic results are genuinely relevant. User preference: users choose semantic over keyword for 40%+ of queries.

**Compounding:** Semantic search is infrastructure for Features 15, 16, 17, and 19. It determines whether cross-domain connections, negative knowledge, gap analysis, and proactive injection can find relevant content. If semantic search is unreliable, every Tier 3 feature that depends on it underperforms.

---

#### Feature 15: Cross-Domain Sparks

| Perspective | Win | Loss |
|-------------|-----|------|
| **Human** | Reads a weekly Sparks digest and finds one connection that changes their thinking about a problem. "I hadn't considered that the training instability we saw in cold-start embeddings might be related to the learning rate sensitivity in signal evaluation." Leads to a new investigation or a combined approach. At least 1 actionable spark per quarter. | Every spark is either obvious ("both topics involve machine learning") or forced ("these artifacts both mention 'performance'"). The human stops reading Sparks within the first month. |
| **Agent** | Briefings include cross-domain connections that inform the agent's approach. Agents propose novel approaches inspired by work in other topics. | Sparks are disconnected from the agent's actual work. |

**Measurable:** Spark quality: human rates at least 1 spark per month as "genuinely non-obvious." Action rate: at least 1 spark per quarter leads to a new thread or investigation. Dismissal rate: <80% (at least 20% of sparks are worth considering).

**Compounding:** This is the apex feature. If it works, the value of having diverse knowledge in Cortex is proven — each new topic doesn't just add knowledge linearly, it multiplies potential connections quadratically. But this only works if Tiers 1 and 2 have built a dense, well-linked, trustworthy knowledge base. Sparks on a sparse, poorly-linked, low-trust KB are noise.

---

#### Features 16-21: Remaining Tier 3

| Feature | Win Condition | Loss Condition | Key Metric |
|---------|--------------|----------------|------------|
| **16. Negative Knowledge Surfacing** | Agent is warned before re-exploring a documented dead end. At least 1 prevented re-derivation per month. | False warnings on approaches that are actually viable in the new context. | Warning accuracy >70%. |
| **17. Gap Analysis** | Identifies genuinely undocumented areas that the human agrees should be documented. Leads to targeted work sessions. | Identifies "gaps" that are intentional scope boundaries. False gap rate >50%. | At least 2 genuine gaps identified per quarter per topic. |
| **18. KB Health Dashboard AI** | Monthly report gives the human a clear, actionable picture of KB quality trends. Leads to curation actions. | Report is a wall of stats with no actionable insight. | Human acts on 2+ recommendations per report. |
| **19. Proactive Context Injection** | Agent receives relevant context it didn't search for, preventing a mistake or duplication. | Injected context is irrelevant, consuming token budget without value. | Relevance rate >60% for injected items. |
| **20. Research Program Arc** | Methodology feedback leads to a different approach being tried. At least 1 methodology insight per topic per quarter. | Generic methodology advice ("consider cross-validation") that any textbook would give. | Specificity: feedback references specific KB content. |
| **21. Debate Mode** | Human uses debate output to make a better decision. Changes their initial position at least once. | Pro/con analysis is balanced but superficial. Human could have generated the same arguments. | Decision quality: human reports debate was useful >60% of the time. |

---

### Compounding Impact Map

The most critical insight from this evaluation framework is that **failures compound as aggressively as successes.** Here's the dependency chain with amplification effects:

```
Auto-Summarization (1)
  ├──→ Daily Digest (2)         [summary quality → digest quality → habit formation]
  ├──→ Session Briefing (6)     [summary quality → briefing quality → orientation speed]
  ├──→ Search results           [summary quality → search relevance → discovery]
  └──→ Topic Synthesis (10)     [summary quality → synthesis quality → cross-domain readiness]

Daily Digest (2)
  └──→ SC9 (Indispensable)      [habit formation → daily usage → reliance]

Skeptical Review (3)
  ├──→ Quality Gate (5)         [review rigor → score credibility → triage efficiency]
  ├──→ Contradiction Detection (7) [review standards → detection quality]
  └──→ SC3 (Trustworthy)       [review quality → trust → adoption → more content → more reviews]

Knowledge Links (4)
  ├──→ Cross-Domain Sparks (15) [graph density → connection quality → spark value]
  └──→ SC6 (Compounds)         [links → navigation → discovery → more links]

Agent Team Dashboard (22)
  └──→ All features             [understanding → trust → engagement → feedback → improvement]
```

**The keystone features are 1 (Auto-Summarization), 2 (Daily Digest), and 3 (Skeptical Review).** If any of these three fail, multiple downstream features degrade. The evaluation framework demands the highest bar for these three features:

- Feature 1 must produce summaries that are specific, accurate, and useful to both humans and agents
- Feature 2 must create a daily habit within 2 weeks of launch
- Feature 3 must catch real issues and avoid false positives within the first 10 reviews

Everything else builds on these three. Ship them first, evaluate rigorously, iterate until they meet the bar, then proceed.

---

## Appendix A: Glossary

| Term | Definition |
|------|-----------|
| **Persona** | A behavioral mode of the AI service (Scribe, Critic, Linker) defined by system prompt and configuration |
| **Cascade** | AI output triggering further AI execution. Prevented by the 3-layer cascade prevention system. |
| **Depth** | The number of AI-triggered AI invocations in a chain. Max depth = 1. |
| **Circuit breaker** | A pattern that disables AI features after repeated API failures to prevent cascading errors |
| **Provider abstraction** | The interface layer that allows swapping LLM providers without changing feature code |
| **Token budget** | Limits on LLM usage at per-invocation, per-persona-per-day, and per-workspace-per-month levels |
| **Density threshold** | Minimum knowledge base size required for a feature to activate |
| **Spark** | A non-obvious cross-domain connection identified by the agent layer |

## Appendix B: Configuration Defaults

```json
{
  "enabled": true,
  "monthly_budget_usd": 50.00,
  "daily_digest_time": "07:00",
  "auto_summarize": true,
  "auto_review": true,
  "auto_review_types": ["decision", "procedure"],
  "auto_link": true,
  "auto_link_min_confidence": 0.7,
  "cascade_max_depth": 1,
  "rate_limits": {
    "scribe": { "per_hour": 20, "per_day_tokens": 50000 },
    "critic": { "per_hour": 10, "per_day_tokens": 30000 },
    "linker": { "per_hour": 15, "per_day_tokens": 20000 }
  },
  "models": {
    "default": "gpt-5",
    "cost_sensitive": "gpt-5-mini",
    "deep_reasoning": "gpt-5",
    "fallback_chain": ["gpt-5.3", "gpt-5", "gpt-5-mini"]
  },
  "density_thresholds": {
    "contradiction_detection": { "min_artifacts": 10 },
    "staleness_detection": { "min_artifacts": 15, "min_days": 60 },
    "topic_synthesis": { "min_resolved_threads": 5 },
    "cross_domain_sparks": { "min_artifacts": 50, "min_topics": 3 },
    "gap_analysis": { "min_artifacts_per_topic": 15 }
  }
}
```

## Appendix C: Monthly Cost Projections

### Conservative Estimate (Low Activity)
- 2 threads resolved/day, 1 artifact/day, 3 briefings/day, 5 Q&A/day
- Tier 1: ~$5/month
- Tier 2: ~$5/month
- **Total: ~$10/month**

### Moderate Estimate (Current Trajectory)
- 5 threads resolved/day, 2 artifacts/day, 5 briefings/day, 10 Q&A/day
- Tier 1: ~$15/month
- Tier 2: ~$15/month
- **Total: ~$30/month**

### High Estimate (Heavy Usage)
- 10 threads resolved/day, 5 artifacts/day, 10 briefings/day, 20 Q&A/day
- Tier 1: ~$30/month
- Tier 2: ~$40/month
- **Total: ~$70/month** (would hit $50 default cap → admin must raise)
