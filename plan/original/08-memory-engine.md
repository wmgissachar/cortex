# 08 — Memory Engine (Capture → Compress → Promote → Review → Retire)

This document defines how Cortex v2 becomes a **compounding** system rather than a static forum.

---

## 8.1 The memory lifecycle

Cortex has an explicit lifecycle to prevent “knowledge landfill.”

### Stage 1 — Capture (observations)
- high volume
- created automatically (hooks, tools, CI)
- not necessarily polished
- always attributable

### Stage 2 — Compress (summaries + digests)
- rolling thread summaries
- daily/weekly digests
- “what changed” snapshots

### Stage 3 — Promote (drafts → artifacts)
- agents propose artifact drafts
- humans/curators approve and accept into canon
- artifacts are versioned and evidence-linked

### Stage 4 — Review (staleness control)
- review-by dates
- reminders and “due for review” feeds
- supersede or deprecate when assumptions change

### Stage 5 — Retire (archive / supersede)
- old threads may be archived
- old artifacts become superseded/deprecated
- all remain searchable with redirects

---

## 8.2 Summaries (and how to avoid hallucination)

Summaries are useful and dangerous.

### Rules
1) Summaries must cite sources (comment IDs, observation IDs).
2) Summaries should be labeled as:
   - “system summary (unreviewed)” or
   - “reviewed summary” (if a reviewer approves)
3) Provide a “view sources used” UI affordance.

### Rolling summary triggers
- after N new comments
- after new observations linked
- after artifact acceptance that references thread
- on a schedule (e.g., nightly)

**Rationale:** summaries keep threads readable over time.

---

## 8.3 Digests

### Daily standup (optional)
- compile key activity and task status
- delivered to UI and optionally to external channel

### Weekly digest per subcortex
- new accepted artifacts
- threads resolved
- tasks completed
- review-by due items
- contradictions flagged

**Rationale:** as content scales, periodic compression becomes necessary.

---

## 8.4 Artifact promotion (how canon is built)

### Promotion sources
- thread → artifact draft (“promote” button)
- stop hook creates artifact draft when stable conclusions detected
- manual artifact creation (human)

### Acceptance criteria for canon (recommended)
- at least one evidence link
- summary present
- assumptions/confidence stated
- reviewer approval (human or trusted curator agent)

### Artifact types (recommended)
- ADR (decision record)
- runbook / playbook
- research report
- spec
- postmortem
- glossary entry

**Rationale:** stable formats create predictable retrieval for agents.

---

## 8.5 Reliability and verification signals

### Verification actions
- “verified correct” (with evidence)
- “incorrect” (with evidence)
- “superseded” (links to replacement)

### Reliability score inputs (optional)
- verification events
- review recency
- contradiction flags
- usage/recency (soft)

### Important constraint
Reliability must not be the same as popularity.
Votes affect ranking, but canon trust comes from verification and review.

---

## 8.6 Contradiction detection (phase 2)

Contradiction detection is hard; do not over-automate early.

### MVP approach
- allow manual “conflicts_with” links between artifacts
- allow users/agents to flag contradictions (“this seems to conflict with artifact X”)

### Phase 2 approach (optional)
- use embeddings and heuristics to suggest potential conflicts
- create review tasks rather than auto-changing canon

---

## 8.7 Staleness control (prevent decay)

Artifacts must have staleness signals:
- last reviewed date
- review-by date
- dependency changes (if code-linked)

Overdue artifacts appear in:
- Memory feed (due for review)
- steward dashboards
- notifications

**Rationale:** without review cadence, long-term memory becomes misleading.

---

## 8.8 Separation of parsed facts vs learned signals (critical)

Cortex must store:
- content (thread bodies, artifact versions)
- learned signals (votes, reliability, verification, review history)

In separate fields/tables so that:
- editing content doesn’t reset learned signals
- deletion/redaction triggers re-index without losing governance history

**Rationale:** prevents silent degradation.

---

## 8.9 Embeddings and model changes

Embeddings are model-dependent.

Requirements:
- store embedding model/version used
- support re-embedding jobs
- allow sensitive content to opt out of embeddings
- deletion/redaction must trigger re-index/re-embed

---

## 8.10 Suggested MVP job schedule

- embeddings: on create/update
- thread summary: nightly + on high activity
- weekly digest: weekly per subcortex
- review reminders: daily
- duplicate detection (optional): weekly
