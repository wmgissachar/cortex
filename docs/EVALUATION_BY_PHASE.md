# Cortex Agent Layer: Evaluation Criteria by Phase

> A phase-by-phase checklist for evaluating every deliverable in the agent roadmap.
> Each phase lists what was built, how to test it, and what success looks like.
>
> Reference: `docs/AGENT_ROADMAP.md` (design), `docs/success-criteria.md` (north star outcomes)

---

## How to Use This Document

For each phase:
1. **Verify** each item under "Functional Tests" — these are binary pass/fail checks
2. **Evaluate** each item under "Quality Criteria" — these require judgment
3. **Observe** the "Behavioral Signals" over time — these indicate real-world success
4. Mark each item: PASS / FAIL / PARTIAL / SKIP (with reason)

---

## Phase A: Infrastructure

**What was built:** The AI execution engine — job tracking, provider abstraction, cascade prevention, circuit breaker, token budgets, event hooks, and the Agent Team Dashboard.

**Prerequisites:** Core Cortex platform operational (topics, threads, artifacts, comments, search, auth).

### Functional Tests

| # | Test | How to Verify | Expected Result |
|---|------|--------------|-----------------|
| A1 | ai_jobs table exists | `SELECT COUNT(*) FROM ai_jobs` | Returns 0+ (no error) |
| A2 | ai_usage table exists | `SELECT COUNT(*) FROM ai_usage` | Returns 0+ (no error) |
| A3 | ai_config table exists | `SELECT COUNT(*) FROM ai_config` | Returns 1 row per workspace |
| A4 | cortex-analyst principal exists | `SELECT * FROM principals WHERE kind='agent'` | Returns the AI agent principal |
| A5 | OpenAI provider connects | Trigger any AI feature | Job completes with status='completed', no provider errors |
| A6 | GET /v1/ai/team | Call endpoint | Returns 3 persona cards (Scribe, Critic, Linker) with status |
| A7 | GET /v1/ai/jobs | Call endpoint | Returns paginated job list |
| A8 | GET /v1/ai/usage | Call endpoint | Returns token/cost usage stats |
| A9 | GET /v1/ai/config | Call endpoint | Returns workspace AI config |
| A10 | PATCH /v1/ai/config | Toggle `enabled` flag | Config updates, persists across restart |
| A11 | Cascade prevention — depth | AI output triggers another AI feature | Second-level triggers are blocked (depth > 1) |
| A12 | Cascade prevention — self-response | Scribe output exists on a thread | Scribe doesn't re-trigger on its own output |
| A13 | Cascade prevention — rate limit | Trigger many jobs rapidly | Jobs are rejected when hourly persona cap is reached |
| A14 | Circuit breaker — opens | Simulate 3 consecutive API failures | Circuit opens, subsequent requests return "AI temporarily unavailable" |
| A15 | Circuit breaker — recovers | Wait for half-open period, then succeed | Circuit closes, normal operation resumes |
| A16 | Budget enforcement — per-invocation | Feature with known token limit | Output is bounded by max_tokens config |
| A17 | Team Dashboard — renders | Navigate to /team page | Shows 3 persona cards, activity log, config panel, usage stats |
| A18 | Team Dashboard — config panel | Toggle settings on /team page | Changes persist, features respond to config changes |
| A19 | Event hooks — thread.resolved | Resolve a thread | EventEmitter fires, downstream listeners execute |
| A20 | Event hooks — artifact.created | Create an artifact | EventEmitter fires, downstream listeners execute |

### Quality Criteria

| # | Criterion | What Good Looks Like |
|---|-----------|---------------------|
| AQ1 | Team Dashboard is understandable | A new user can identify what each persona does, its current status, and how to configure it within 60 seconds |
| AQ2 | Error messages are actionable | When circuit breaker is open or budget exhausted, the UI/API explains what happened and when it will recover |
| AQ3 | Job tracking is complete | Every AI invocation creates a job record with persona, feature, target, tokens used, cost, duration, and status |

### Behavioral Signals (observe over 1-2 weeks)

- The human visits /team at least weekly to check AI activity
- The human adjusts at least 1 config setting based on observed behavior
- No runaway AI costs (monthly spend stays within budget)
- No infinite loops or cascade storms in logs

---

## Phase B: The Scribe Launches (Tier 1)

**What was built:** Scribe persona + Feature 1 (Thread Auto-Summarization) + Feature 2 (Daily Digest).

**Prerequisites:** Phase A complete.

### Feature 1: Thread Auto-Summarization

#### Functional Tests

| # | Test | How to Verify | Expected Result |
|---|------|--------------|-----------------|
| B1 | Auto-trigger on resolve | Resolve a thread with 5+ comments | Summary appears on thread within 30 seconds |
| B2 | Manual trigger | `POST /v1/ai/summarize/:threadId` | Summary generated and saved to thread.summary |
| B3 | Summary persists | Refresh page after summary generates | Summary still visible |
| B4 | Empty thread handling | Resolve a thread with 0 comments | Graceful skip or minimal summary (no error) |
| B5 | Job recorded | Check /team activity after summarization | Job appears with persona=scribe, feature=thread-summary |
| B6 | Token usage tracked | Check /team usage stats | Token count and cost recorded |

#### Quality Criteria

| # | Criterion | What Good Looks Like |
|---|-----------|---------------------|
| BQ1 | Specificity | Summary contains at least 1 specific metric, decision, or named outcome (not just "work was completed") |
| BQ2 | Accuracy | Summary does not hallucinate facts not present in the thread |
| BQ3 | Conciseness | Summary is 2-5 sentences, readable in under 15 seconds |
| BQ4 | Coverage | Summary captures the main conclusion, not just the last comment |

#### Evaluation Method

Generate 10 summaries from real threads. For each, score:
- **Accurate?** (no hallucinated facts) — target: 9/10
- **Specific?** (contains a concrete detail) — target: 8/10
- **Useful?** (would help someone decide whether to read the full thread) — target: 8/10

### Feature 2: Daily Digest

#### Functional Tests

| # | Test | How to Verify | Expected Result |
|---|------|--------------|-----------------|
| B7 | Manual generation | `POST /v1/ai/digest/generate` | Digest content returned + posted to digest thread |
| B8 | GET latest digest | `GET /v1/ai/digest/latest` | Returns most recent digest job |
| B9 | Digest thread created | Check threads list | A "Daily Digest" thread exists with digest observations |
| B10 | Scheduler fires | Check logs or /team activity at configured time | Digest generated automatically once per day |
| B11 | Frontend display | Navigate to /home or dashboard | Digest section visible with formatted content |

#### Quality Criteria

| # | Criterion | What Good Looks Like |
|---|-----------|---------------------|
| BQ5 | Actionable items | Digest highlights 1-3 items that need human attention, not just a recap |
| BQ6 | Narrative over list | Digest reads as a briefing, not a bullet-point activity log |
| BQ7 | Completeness | Covers all significant activity since the last digest |
| BQ8 | Time to read | Digest is readable in under 2 minutes |

#### Behavioral Signals

- The human reads the digest within 2 hours of generation (most days)
- The human acts on at least 1 item from the digest per week
- Thread summaries appear on 95%+ of resolved threads

---

## Phase C: The Critic Launches (Tier 1)

**What was built:** Critic persona + Feature 3 (Skeptical Review) + Feature 5 (Artifact Quality Gate).

**Prerequisites:** Phase B complete.

### Feature 3: Skeptical Review + Feature 5: Quality Gate

#### Functional Tests

| # | Test | How to Verify | Expected Result |
|---|------|--------------|-----------------|
| C1 | Auto-trigger on artifact creation | Create a decision or procedure artifact | Review appears as observation on artifact's discussion thread within 60 seconds |
| C2 | Manual trigger | `POST /v1/ai/review/:artifactId` | Review generated and posted |
| C3 | Review posted correctly | Check artifact's discussion thread | Observation exists with tags [ai-critic, skeptical-review] |
| C4 | Cascade prevention | AI-generated observation is posted | Critic does NOT review AI-generated content |
| C5 | Quality score present | Read the review observation | Contains a quality assessment (score or qualitative rating) |
| C6 | Selective triggering | Create a glossary-type artifact | Review may be skipped for low-value artifact types (configurable) |

#### Quality Criteria

| # | Criterion | What Good Looks Like |
|---|-----------|---------------------|
| CQ1 | Specificity | Review references specific sections, claims, or metrics in the artifact — not generic feedback |
| CQ2 | Actionability | At least 50% of reviews suggest a specific improvement the author could make |
| CQ3 | False positive rate | <20% of issues raised are things the human determines are not actually issues |
| CQ4 | Adversarial value | Review identifies at least 1 thing the human wouldn't have noticed on their own (across 10 reviews) |

#### Evaluation Method

Generate 10 reviews from real artifacts. For each, score:
- **Specific?** (references a particular claim or section) — target: 9/10
- **Accurate?** (issue identified is real) — target: 8/10
- **Would you edit based on this?** — target: 3-4/10 (too high means artifacts are bad; too low means reviews are useless)

---

## Phase D: The Linker Launches (Tier 1)

**What was built:** Linker persona + Feature 4 (Knowledge Link Suggestion) + Feature 6 (Session Handoff Briefing).

**Prerequisites:** Phase B complete.

### Feature 4: Knowledge Link Suggestion

#### Functional Tests

| # | Test | How to Verify | Expected Result |
|---|------|--------------|-----------------|
| D1 | Auto-trigger on artifact creation | Create an artifact related to existing content | Link suggestions appear as observation within 30 seconds |
| D2 | Links created | Check knowledge_links table | New link records exist with typed relationships |
| D3 | Suggestion quality | Read the link suggestion observation | Justification explains why each link is relevant |
| D4 | Cascade prevention | AI-created artifacts | Linker does NOT trigger on agent-created content |
| D5 | Minimum content | Create artifact when KB has <3 other artifacts | Graceful behavior (may skip or suggest fewer links) |

#### Quality Criteria

| # | Criterion | What Good Looks Like |
|---|-----------|---------------------|
| DQ1 | Link relevance | >60% of suggested links are genuinely meaningful connections |
| DQ2 | Relationship typing | >70% of links use specific types (contradicts, supersedes, supports) vs. generic (related_to) |
| DQ3 | Non-obvious connections | At least 1 in 5 suggestions connects artifacts the human hadn't mentally linked |

### Feature 6: Session Handoff Briefing

#### Functional Tests

| # | Test | How to Verify | Expected Result |
|---|------|--------------|-----------------|
| D6 | Generate briefing | `POST /v1/ai/briefing` with topic_id | Returns briefing content with narrative context |
| D7 | Briefing card on topic page | Navigate to topic detail page | Briefing section visible, can generate new briefing |
| D8 | Topic scoping | Generate briefing for different topics | Each briefing is specific to its topic |
| D9 | GET latest briefing | `GET /v1/ai/briefing/latest?topic_id=X` | Returns most recent briefing for topic |
| D10 | MCP briefing tool | Use `cortex_briefing` MCP tool | Returns briefing text |

#### Quality Criteria

| # | Criterion | What Good Looks Like |
|---|-----------|---------------------|
| DQ4 | Context completeness | Briefing covers: current state, recent activity, open questions, and known constraints |
| DQ5 | "Do not retry" section | Briefing mentions failed/abandoned approaches when they exist |
| DQ6 | Orientation speed | A human can understand a topic's state in 60 seconds from the briefing alone |
| DQ7 | Freshness | Briefing reflects activity from the last 48 hours, not just historical summary |

#### Behavioral Signals

- Knowledge graph density increases (average links per artifact grows from <1 to 2+)
- Agents reference briefing content in their first observation
- Briefings are generated at least 3x/week across all topics

---

## Phase E: Tier 2 Features

**What was built:** 7 features that build on Tier 1 infrastructure.

**Prerequisites:** All three personas operational (Phases B-D). Knowledge base has 20+ artifacts.

### Feature 11: Ask Cortex Q&A

#### Functional Tests

| # | Test | How to Verify | Expected Result |
|---|------|--------------|-----------------|
| E1 | API endpoint | `POST /v1/ai/ask { "query": "What do we know about X?" }` | Returns cited answer |
| E2 | Topic-scoped query | `POST /v1/ai/ask { "query": "...", "topic_id": "..." }` | Answer scoped to topic |
| E3 | Frontend Ask AI | Navigate to /search, use Ask AI input | Answer displays with markdown formatting |
| E4 | MCP tool | Use `cortex_ask` MCP tool | Returns answer text |
| E5 | Citations present | Read answer content | References specific artifacts/threads by title and ID |
| E6 | Unknown answer handling | Ask about something not in the KB | Response says "this information is not in the knowledge base" (no hallucination) |

#### Quality Criteria

| # | Criterion | What Good Looks Like |
|---|-----------|---------------------|
| EQ1 | Citation accuracy | >85% of cited artifacts/threads are real and relevant to the answer |
| EQ2 | Answer completeness | Answer synthesizes information from multiple sources when available |
| EQ3 | Honesty about gaps | When KB doesn't contain the answer, the system says so instead of guessing |

#### Evaluation Method

Ask 10 questions spanning different topics:
- 5 questions where the answer IS in the KB
- 3 questions where the answer is PARTIALLY in the KB
- 2 questions where the answer is NOT in the KB

Score: Accurate citations, correct answers, honest "I don't know" responses.

### Feature 12: Auto-Tagging

#### Functional Tests

| # | Test | How to Verify | Expected Result |
|---|------|--------------|-----------------|
| E7 | Auto-trigger on artifact creation | Create a new artifact (as human) | Tags appear on the artifact within 30 seconds |
| E8 | Taxonomy consistency | Check tags applied | Uses existing tags from the taxonomy when appropriate |
| E9 | Cascade prevention | AI-created artifacts | Auto-tagging does NOT trigger on agent-created content |
| E10 | Config toggle | Disable auto_tag in config | New artifacts are not auto-tagged |

#### Quality Criteria

| # | Criterion | What Good Looks Like |
|---|-----------|---------------------|
| EQ4 | Tag acceptance rate | >75% of auto-applied tags are ones the human would have chosen |
| EQ5 | Taxonomy growth | New tags are created sparingly (prefer existing tags) |
| EQ6 | Specificity | Tags are specific enough to be useful for filtering (not just "research") |

### Feature 13: Thread Resolution Prompt

#### Functional Tests

| # | Test | How to Verify | Expected Result |
|---|------|--------------|-----------------|
| E11 | Scheduler identifies stale threads | Check logs or /team activity | Threads open >7 days with no recent comments are identified |
| E12 | Nudge posted | Check stale thread comments | Observation with tag [resolution-prompt] appears |
| E13 | No duplicate nudges | Wait for next scheduler run | Same thread is NOT nudged again within 7 days |
| E14 | Config toggle | Disable thread_resolution_prompt | Nudges stop |

#### Quality Criteria

| # | Criterion | What Good Looks Like |
|---|-----------|---------------------|
| EQ7 | Tone | Nudge is helpful and specific ("This thread about X has been open 14 days — should it be resolved?"), not generic |
| EQ8 | Relevance | Nudge is appropriate — doesn't nag about threads intentionally left open |

### Feature 9: Observation Triage

#### Functional Tests

| # | Test | How to Verify | Expected Result |
|---|------|--------------|-----------------|
| E15 | Manual trigger | `POST /v1/ai/triage { "thread_id": "..." }` (thread with 10+ observations) | Triage observation posted |
| E16 | Frontend button | Navigate to thread with 10+ comments | "Triage Observations" button visible and functional |
| E17 | Categorization | Read triage output | Observations categorized into Key Results, Decisions, Negative Results, Open Questions, Meta |
| E18 | Scheduler auto-triage | Check logs | Threads with 10+ observations are auto-triaged daily |
| E19 | Config toggle | Disable auto_triage | Auto-triage stops |

#### Quality Criteria

| # | Criterion | What Good Looks Like |
|---|-----------|---------------------|
| EQ9 | Classification accuracy | >85% of observations are placed in the correct category |
| EQ10 | Completeness | No significant observation is omitted from the triage |
| EQ11 | Compression value | Reading the triage is 3-5x faster than reading all observations individually |

### Feature 7: Contradiction Detection

#### Functional Tests

| # | Test | How to Verify | Expected Result |
|---|------|--------------|-----------------|
| E20 | Manual trigger | `POST /v1/ai/contradictions { "topic_id": "..." }` (topic with 10+ artifacts) | Report posted to contradiction thread |
| E21 | Frontend button | Navigate to topic with 10+ artifacts | "Detect Contradictions" button visible and functional |
| E22 | Report thread | Check threads for topic | A "Contradiction Detection" thread exists with the report |
| E23 | Citation format | Read the report | Each contradiction cites both artifacts by title and ID |
| E24 | Scheduler runs | Check logs (every 3 days) | Contradiction detection runs automatically for eligible topics |
| E25 | Config toggle | Disable contradiction_detection | Detection stops |

#### Quality Criteria

| # | Criterion | What Good Looks Like |
|---|-----------|---------------------|
| EQ12 | True positive rate | >70% of flagged contradictions are genuine conflicts |
| EQ13 | Severity assessment | Report rates each contradiction (critical/substantive/minor) |
| EQ14 | Actionability | Report makes clear which artifact should be updated or deprecated |

### Feature 10: Topic Synthesis

#### Functional Tests

| # | Test | How to Verify | Expected Result |
|---|------|--------------|-----------------|
| E26 | Manual trigger | `POST /v1/ai/synthesis { "topic_id": "..." }` (topic with 5+ resolved threads) | Synthesis artifact created |
| E27 | Frontend button | Navigate to topic with 5+ resolved threads | "Generate Synthesis" button visible |
| E28 | Artifact created | Check topic's artifacts tab | New document-type artifact titled "Topic Synthesis: {topic}" |
| E29 | Scheduler runs | Check logs (1st of month) | Synthesis auto-generates for eligible topics |

#### Quality Criteria

| # | Criterion | What Good Looks Like |
|---|-----------|---------------------|
| EQ15 | Narrative arc | Synthesis tells a story of how understanding evolved, not just a list of thread summaries |
| EQ16 | Newcomer test | A person unfamiliar with the topic can understand its current state from the synthesis alone |
| EQ17 | Completeness | Synthesis covers major threads and decisions, not just the most recent |
| EQ18 | Shareability | Human rates synthesis as "would share with a colleague" >70% of the time |

### Feature 8: Staleness Detection

#### Functional Tests

| # | Test | How to Verify | Expected Result |
|---|------|--------------|-----------------|
| E30 | Manual trigger | `POST /v1/ai/staleness { "topic_id": "..." }` (topic with 15+ artifacts) | Report posted to staleness thread |
| E31 | Frontend button | Navigate to topic with sufficient artifacts | "Detect Staleness" button visible |
| E32 | Report thread | Check threads for topic | A "Staleness Report" thread exists |
| E33 | Scheduler runs | Check logs (1st and 15th of month) | Staleness detection runs biweekly for eligible topics |
| E34 | Config toggle | Disable staleness_detection | Detection stops |

#### Quality Criteria

| # | Criterion | What Good Looks Like |
|---|-----------|---------------------|
| EQ19 | Staleness identification | Correctly identifies artifacts with time-sensitive claims that may be outdated |
| EQ20 | False staleness rate | <30% of flagged artifacts are actually still current |
| EQ21 | Actionability | Each flagged artifact has a specific suggested action (update, deprecate, review) |

### Phase E Config Panel

| # | Test | How to Verify | Expected Result |
|---|------|--------------|-----------------|
| E35 | All 5 toggles visible | Navigate to /team config section | auto_tag, auto_triage, contradiction_detection, staleness_detection, thread_resolution_prompt toggles present |
| E36 | Toggles persist | Toggle a setting, refresh page | Setting remains changed |
| E37 | Toggles affect behavior | Disable a feature, trigger its condition | Feature does not run |

### Phase E Behavioral Signals (observe over 2-4 weeks)

- Ask Cortex is used 5+ times per week
- The human resolves at least 1 stale thread after a resolution prompt
- Auto-tags are accepted (not removed) >75% of the time
- Contradiction reports lead to at least 1 artifact update per quarter
- The human reads synthesis documents and finds them useful

---

## Phase F: Tier 3 Features (Future)

**What will be built:** 8 advanced features requiring dense knowledge base and 60+ days of operational history.

**Prerequisites:** Tier 2 operational. 50+ artifacts across 3+ topics. Agent layer operational 60+ days.

### Feature 14: Semantic Search

| # | Test | Expected Result |
|---|------|-----------------|
| F1 | Concept query finds results keyword search misses | Search for "methods that handle data scarcity" returns relevant artifacts even if they don't contain those exact words |
| F2 | Embedding storage | Vector embeddings exist for all artifacts and thread summaries |
| F3 | Hybrid search | Results combine keyword and semantic relevance |

**Quality:** Search recall improves 30%+ over keyword-only for concept queries. Precision >70%.

### Feature 15: Cross-Domain Sparks

| # | Test | Expected Result |
|---|------|-----------------|
| F4 | Spark generation | Weekly sparks digest identifies non-obvious connections across topics |
| F5 | Spark quality | At least 1 spark per month is rated "genuinely non-obvious" by the human |
| F6 | Action from spark | At least 1 spark per quarter leads to a new investigation |

**Quality:** Dismissal rate <80% (at least 20% of sparks are worth considering).

### Feature 16: Negative Knowledge Surfacing

| # | Test | Expected Result |
|---|------|-----------------|
| F7 | Proactive warning | Agent is warned before re-exploring a documented dead end |
| F8 | Warning accuracy | >70% of warnings reference genuinely failed approaches |
| F9 | Prevention metric | At least 1 prevented re-derivation per month |

### Feature 17: Gap Analysis

| # | Test | Expected Result |
|---|------|-----------------|
| F10 | Gap identification | Identifies undocumented areas the human agrees should be documented |
| F11 | False gap rate | <50% of identified gaps are intentional scope boundaries |
| F12 | Action from gaps | At least 2 genuine gaps identified per quarter per topic |

### Feature 18: Knowledge Health Dashboard AI

| # | Test | Expected Result |
|---|------|-----------------|
| F13 | Monthly health report | AI-generated report on KB quality trends |
| F14 | Actionable recommendations | Human acts on 2+ recommendations per report |

### Feature 19: Proactive Context Injection

| # | Test | Expected Result |
|---|------|-----------------|
| F15 | Relevant context surfaced | Agent receives context it didn't search for that prevents a mistake |
| F16 | Relevance rate | >60% of injected items are genuinely useful |

### Feature 20: Research Program Arc

| # | Test | Expected Result |
|---|------|-----------------|
| F17 | Methodology feedback | Provides specific, KB-referenced methodology insights |
| F18 | Specificity | Feedback references specific content, not textbook advice |
| F19 | Action rate | At least 1 methodology insight per topic per quarter leads to different approach |

### Feature 21: Debate Mode

| # | Test | Expected Result |
|---|------|-----------------|
| F20 | Pro/con generation | Generates substantive arguments on both sides of a question |
| F21 | Evidence-based | Arguments cite specific artifacts and evidence |
| F22 | Decision impact | Human reports debate was useful >60% of the time |

---

## Cross-Phase: Success Criteria Alignment

These map to the 9 north star criteria in `docs/success-criteria.md`. Check these periodically (monthly) to assess overall system health.

### SC1: No Agent Ever Re-Derives a Conclusion That Already Exists

| Phase | Contribution | How to Measure |
|-------|-------------|----------------|
| B | Thread summaries make prior conclusions searchable | Agent orientation tool calls decrease by 30% |
| D | Briefings deliver prior conclusions proactively | Agents reference briefing content in first observation |
| E | Ask Cortex lets agents verify "has this been tried?" | Q&A usage for verification queries |
| F | Proactive surfacing warns before duplication | Re-derivation rate drops to <5% |

### SC2: Dead Ends Are Visible Before Someone Walks Into Them

| Phase | Contribution | How to Measure |
|-------|-------------|----------------|
| D | Briefings include "do not retry" section | Failed approaches mentioned in briefings |
| E | Observation triage categorizes negative results | Negative results are discoverable via search |
| F | Negative knowledge surfacing provides proactive warnings | Warning accuracy >70% |

### SC3: Knowledge Stays Trustworthy as It Scales

| Phase | Contribution | How to Measure |
|-------|-------------|----------------|
| C | Skeptical review catches quality issues | Review action rate 20-40% |
| E | Contradiction detection finds conflicting claims | True positive rate >70% |
| E | Staleness detection flags outdated content | Deprecated artifact count increases |

### SC4: The Human's Cognitive Reach Expands (North Star)

| Phase | Contribution | How to Measure |
|-------|-------------|----------------|
| B | Daily digest compresses activity into 2-minute read | Human reads digest daily |
| E | Topic synthesis provides executive summaries | Human understands topic without reading threads |
| E | Ask Cortex provides instant answers | 5+ queries/week sustained |
| F | Cross-domain sparks surface non-obvious connections | 1 actionable spark per quarter |

### SC9: Cortex Becomes Harder to Not Use Than to Use

| Phase | Contribution | How to Measure |
|-------|-------------|----------------|
| B | Daily digest creates the daily habit | Digest read rate >70% |
| C | Skeptical review catches things human would miss | Human relies on reviews |
| D | Briefings make agent orientation effortless | All sessions start with briefing |
| E | Ask Cortex becomes the default way to find information | Human uses Q&A before manual search |

---

## Compounding Impact Map

Features don't exist in isolation. The roadmap from Part 9 of AGENT_ROADMAP.md identifies these critical dependency chains:

```
Auto-Summarization (1)                         [KEYSTONE]
  +---> Daily Digest (2)         quality of summaries --> quality of digest --> daily habit
  +---> Session Briefing (6)     quality of summaries --> briefing quality --> orientation speed
  +---> Search results           quality of summaries --> search relevance --> discovery
  +---> Topic Synthesis (10)     quality of summaries --> synthesis quality --> cross-domain readiness

Daily Digest (2)                                [KEYSTONE]
  +---> SC9 (Indispensable)      habit formation --> daily usage --> reliance

Skeptical Review (3)                            [KEYSTONE]
  +---> Quality Gate (5)         review rigor --> score credibility --> triage efficiency
  +---> Contradiction Detect (7) review standards --> detection quality
  +---> SC3 (Trustworthy)        review quality --> trust --> adoption --> more content

Knowledge Links (4)
  +---> Cross-Domain Sparks (15) graph density --> connection quality --> spark value
  +---> SC6 (Compounds)          links --> navigation --> discovery --> more links

Agent Team Dashboard (22)
  +---> All features              understanding --> trust --> engagement --> feedback
```

**The keystone features are 1, 2, and 3.** If any fail, multiple downstream features degrade. Evaluate these with the highest bar.

---

## Quick Reference: Feature-to-Phase Map

| Feature | Name | Tier | Phase | Persona |
|---------|------|------|-------|---------|
| 1 | Thread Auto-Summarization | 1 | B | Scribe |
| 2 | Daily Digest | 1 | B | Scribe |
| 3 | Skeptical Review | 1 | C | Critic |
| 4 | Knowledge Link Suggestion | 1 | D | Linker |
| 5 | Artifact Quality Gate | 1 | C | Critic |
| 6 | Session Handoff Briefing | 1 | D | Scribe |
| 7 | Contradiction Detection | 2 | E | Critic |
| 8 | Staleness Detection | 2 | E | Scribe |
| 9 | Observation Triage | 2 | E | Scribe |
| 10 | Topic Synthesis | 2 | E | Scribe |
| 11 | Ask Cortex Q&A | 2 | E | Scribe |
| 12 | Auto-Tagging | 2 | E | Linker |
| 13 | Thread Resolution Prompt | 2 | E | Scribe |
| 14 | Semantic Search | 3 | F | Linker |
| 15 | Cross-Domain Sparks | 3 | F | Linker |
| 16 | Negative Knowledge Surfacing | 3 | F | Scribe |
| 17 | Gap Analysis | 3 | F | Linker |
| 18 | KB Health Dashboard AI | 3 | F | Scribe |
| 19 | Proactive Context Injection | 3 | F | Scribe |
| 20 | Research Program Arc | 3 | F | Critic |
| 21 | Debate Mode | 3 | F | Critic |
| 22 | Agent Team Dashboard | 1 | A | — |

---

## Monthly Cost Expectations

| Phase | Features Active | Expected Monthly Cost |
|-------|----------------|----------------------|
| A | Dashboard only | $0 |
| B | Summarization + Digest | $1.50-4.80 |
| C | + Skeptical Review | $2.70-11.00 |
| D | + Links + Briefing | $5.10-30.00 |
| E | + All Tier 2 | $9.36-72.00 |
| F | + All Tier 3 | TBD (depends on embedding costs + usage) |

Default monthly budget cap: $50. Heavy usage of Ask Cortex Q&A is the primary cost driver. Monitor via /team usage dashboard.
