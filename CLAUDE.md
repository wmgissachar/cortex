# Cortex Knowledge Base

This project is connected to a **Cortex** knowledge management server via MCP. Cortex is the shared institutional memory across all projects. Other agents in other projects read what you write here, and you benefit from what they've documented. Treat it as the team's brain.

## MANDATORY: Session Start

You MUST call `cortex_get_context` at the very start of every session, before doing anything else. This is non-negotiable. It orients you to the shared knowledge base across all projects and prevents you from duplicating work that's already been done.

## Session Orientation

After `cortex_get_context`, orient to your specific topic:
- Use `cortex_get_context({ topic_id: "..." })` for topic-scoped context showing first principles, open threads, decisions, and tasks
- Use `cortex_briefing({ topic_id: "..." })` to get a narrative briefing including "What NOT to Retry" (failed approaches, dead ends)
- Search for `negative-result` tagged observations before proposing new approaches: `cortex_search({ query: "your topic", type: "comments" })`

This prevents re-derivation of known dead ends (SC1, A1, A4).

### Authority hierarchy
When working on a topic, respect this priority order. Higher authority always wins in conflicts:
1. **First Principles** (highest) — human-defined guiding beliefs and success criteria. Always authoritative.
2. **Human comments** — corrections, overrides, and feedback left by humans on any thread (including plan threads).
3. **AI-generated content** (lowest) — plans, briefings, summaries. Useful as a starting point but always subordinate to human input.

### First Principles awareness
- Every topic may have first principles and success criteria defined
- These appear at the top of `cortex_get_context({ topic_id: "..." })` output, right after the topic header
- First principles are **authoritative** — they override all AI-generated content including plans and suggestions
- If evidence suggests a principle should evolve, post an observation with `sub_type: "question"` flagging the tension
- Only humans edit first principles directly; agents can propose changes but must not modify them

### Project Plan awareness
- Topics may have an AI-generated project plan (a thread tagged `project-plan`)
- `cortex_get_context({ topic_id })` will surface the plan prominently with instructions to read it
- **Always read the full plan thread** with `cortex_get_thread` before starting work — including all comments
- Human comments on the plan are corrections that override the AI-generated plan content
- When executing plan tasks, check that your work aligns with first principles AND any human corrections

## MANDATORY: Continuous Documentation

Do NOT save all your writing for the end. Document as you work, not after.

### Thread creation (once per session)
- At the start of any non-trivial task, create a thread (`cortex_create_thread`) describing what you're about to do
- This gives other agents and the human visibility into active work

### Observations (after each significant step)
- Post an observation (`cortex_observe`) after each meaningful step: a bug found, a design decision made, a surprising result, a file changed and why
- If you discover something unexpected, document it immediately — don't wait
- Each observation should be self-contained: someone reading just that observation should understand what happened

### Checkpoints (every 10-15 minutes of active work)
- Use `cortex_checkpoint` periodically during long tasks
- Include: what you've done so far, what you're doing now, what's next
- This creates a recoverable trail if the session crashes

### Tasks (immediately when identified)
- When you identify follow-up work, create a task (`cortex_create_task`) right away
- Do NOT bury follow-up items in prose — make them explicit, trackable tasks
- Update task status as work progresses (`cortex_update_task`)

### Artifacts (when knowledge is worth preserving)
- Create artifacts (`cortex_draft_artifact`) for reusable knowledge: architecture docs, procedures, decisions, reference material, glossaries
- Artifacts are the polished output; threads and observations are the working trail
- Do NOT duplicate thread content in artifacts — they serve different purposes
- Use the `references` field to link related artifacts together
- Artifacts you create are **auto-accepted** (no human review needed), so write them carefully

## Thread Lifecycle

Threads follow: `open` -> `resolved` -> `archived`

- When finishing a session, **resolve** your thread: `cortex_update_thread({id: "...", status: "resolved"})`
- Use `resolved` for completed work, `archived` for permanently closed discussions
- You can reopen a resolved thread if work resumes

### Thread summaries (when resolving)
- When resolving a thread with `cortex_update_thread`, always include a `summary` field
- The summary should be 1-2 sentences describing the outcome or conclusion
- Good: "Investigated cold-start embedding architectures. Architecture ceiling at R@50=15.37%. GRU-based approach rejected due to training instability."
- Bad: "Work done" or "Completed investigation"

### Promoting observations to artifacts (when resolving)
When resolving a thread that produced important findings:
1. Identify observations with significant outcomes: experimental results, design decisions, dead ends with lessons
2. Create a decision artifact (`cortex_draft_artifact`) capturing the key conclusions, rationale, and implications
3. Use `supersedes` if the new artifact replaces an older one
4. Tag dead-end artifacts with `dead-end` and outcome artifacts with `validated`

Not every thread needs an artifact. The threshold: "Would a new agent 3 months from now need this conclusion?" If yes, promote it.

### MANDATORY: Session Completion

Before ending ANY non-trivial session, you MUST complete the session documentation protocol:

1. **Run session audit**: `cortex_session_complete({ thread_id: "...", topic_id: "..." })`
2. **Address all "must" items** in the returned scorecard
3. **Address "should" items** where applicable — especially artifact promotion
4. **Re-run audit** (optional) to verify completeness
5. **Resolve thread** with `cortex_update_thread({ id: "...", status: "resolved", summary: "..." })`

The scorecard ensures your documentation is complete enough for the next agent to seamlessly continue your work. Skipping this step degrades the entire knowledge chain.

#### What the scorecard checks
- Thread has a meaningful summary (not "done" — describe outcomes and next steps)
- Observations have sub_types (result, negative-result, decision, question, methodology)
- Key findings are promoted to artifacts (decisions, results, dead ends)
- Follow-up work is captured as explicit tasks
- Failed approaches are tagged negative-result (prevents future agents from re-exploring)

#### Artifact promotion guide
After significant sessions, promote observations to artifacts:
- **Choices made** → `decision` artifact (architecture, tool selection, parameter choices)
- **Results/findings** → `document` artifact (benchmarks, analysis outcomes, data summaries)
- **Failed approaches** → `document` artifact tagged `dead-end` (what failed, why, when to revisit)
- **Processes discovered** → `procedure` artifact (reproducible steps for data pipeline, testing, etc.)

#### Thread state for multi-agent workflows
- Resolve the thread if your work is complete and no continuation is expected
- Leave the thread **open** if another agent will continue the work — this preserves handoff state

## Artifact Supersession

When creating an artifact that replaces an older one, use the `supersedes` parameter:
```
cortex_draft_artifact({ title: "...", ..., supersedes: "<old-artifact-id>" })
```
This creates a knowledge link. The old artifact shows a supersession banner in the UI.

## Core Computation Artifacts

Each project has **1-3 fundamental algorithms** that define what it is — a signal computation, a scoring formula, an embedding architecture. These (and only these) must be documented as `procedure` artifacts in Cortex for cross-project reuse. Everything else stays in git.

**Litmus test:** "Would another project need this to integrate with mine?" and "Is this function essentially the same 3 months from now?" If both yes → Cortex artifact. If no → it's implementation detail, leave it in git.

### What to include
- **Actual runnable code**, not pseudo-code. The bar: "can another agent produce a working implementation from this artifact alone?"
- Function signatures, dependencies, standard configurations
- Input/output spec (data format, frequency, interpretation)
- Important caveats (known bugs, parameter sensitivity, lookahead corrections)

### What NOT to include
- Data loading, CLI scaffolding, test suites, notebooks, configs
- Helper functions that only matter internally
- Strategy-layer decisions (trade rules, position sizing, risk overlays) — these evolve and belong in git
- Code that changes frequently — that belongs in git

### Versioning
- Tag with `core-computation` and include a version date in the title (e.g., "v1, 2026-02-20")
- When the code evolves, create a **new** artifact that `supersedes` the old one — do NOT edit the original
- Reference the source file path so humans can verify against the actual codebase

### Cross-project discovery
- Also tag with `cross-project` so agents in other topics find them via `cortex_search`
- Before reimplementing an algorithm from another project, search for `core-computation` tagged artifacts first

### Observation sub-types
When using `cortex_observe`, use the `sub_type` parameter to categorize:
- `result`: Experimental outcome with metrics
- `negative-result`: Something tried that failed — document what, why, and when to revisit
- `decision`: A choice made with rationale
- `question`: An open question for human review
- `methodology`: A note about approach or technique

Negative results are especially valuable — they prevent future agents from re-exploring dead ends.

## Documenting Dead Ends

- When an approach is tried and fails, use `sub_type: "negative-result"` on the observation
- Include: what was tried, why it failed, under what conditions, when to revisit
- Before starting a new approach, search for `negative-result` tag to check prior attempts
- Example: `cortex_observe({ thread_id: "...", body: "## Dead End: Ridge Reconstruction\n...", sub_type: "negative-result", tags: ["cold-start"] })`

## Knowledge Links

Use `cortex_create_knowledge_link` to connect related artifacts:
- `supersedes`: New artifact replaces an old one (also available via `cortex_draft_artifact`'s `supersedes` parameter)
- `contradicts`: Two artifacts conflict — flag for resolution
- `supports`: One artifact provides evidence for another
- `depends_on`: One artifact depends on conclusions in another
- `related_to`: General relationship

## Before Starting Work

- Search Cortex for existing decisions and prior work on your topic
- Use `cortex_get_context({ topic_id: "..." })` for topic-scoped orientation
- Check for `dead-end` tagged observations before proposing new approaches
- Reference prior work in your first observation: "Building on artifact X..."

## When to search Cortex

- **Before major work**: Search (`cortex_search`) for relevant threads/artifacts — someone may have already solved your problem or documented a decision that affects your approach
- **When encountering unfamiliar code/systems**: Check if architecture docs or glossaries exist
- **Before making design decisions**: Check for prior decisions on the same topic

## Key topics

Topics are organized by project:
- **Cortex Platform** (`cortex-platform`) — Cortex's own architecture, API, MCP, web UI, AI agents
- **ReelRecs** (`reelrecs`) — Cold-start embeddings, V2 scoring, recommendation system R&D
- **CSI Backtesting** (`csi-backtesting`) — CSI alpha research, QQE optimization, trading strategy
- **BTC ATH-FREQ** (`btc-ath-freq`) — Bitcoin ATH frequency analysis and backtesting
- **Research Notes** (`research-notes`) — Cross-project research, general methodology
- **Quad Earnings Navigator** (`quad-earnings-navigator`) — Factor-based S&P 500 trading strategy

When creating threads or artifacts, use the topic that matches your project. Use `cortex_get_context` to see current topic IDs.

### No matching topic?

If none of the existing topics match your project, you MUST:
1. Tell the human: "None of the existing Cortex topics match this project. Should I create a new topic?"
2. **Wait for explicit approval** — do NOT create a topic without the human saying yes
3. If approved, ask the human for a name and description (or propose one for their approval)
4. Create the topic using `cortex_create_topic({ handle: "my-project", name: "My Project", description: "..." })`
5. Then proceed with your session thread in the new topic

Do NOT shoehorn content into an unrelated topic (e.g., `research-notes`) just because it exists. Do NOT skip documentation because no topic matches. Ask first, then create.

## Outcome Tags for Artifacts

- `validated`: Approach tested and confirmed working
- `dead-end`: Approach tried and rejected — artifact body explains why and when to revisit
- `blocked`: Depends on external factor not yet resolved
- `exploratory`: Preliminary investigation, conclusions tentative

These tags enable briefings and search to surface outcome-aware context.

## Quality guidelines

- Tag content appropriately for searchability
- Use specific, descriptive thread titles (not "Work session" — say what the work is)
- Observations should document the *why*, not just the *what*
- Decision artifacts should include: context, evidence, alternatives considered, and implications
- Human-created artifacts go through draft -> proposed -> accepted; agent artifacts skip this
