# 10 — Integrations and Plugin Model

Cortex v2 should be extensible without turning into “everything for everyone.”

The integration strategy is:
- Core is the stable source of truth.
- Sidecar hosts plugins for local context and safe ingestion.
- Plugins enrich context packs and automate observation ingestion.

---

## 10.1 Plugin design goals

1) Plugins must be optional and sandboxable.
2) Plugins must not compromise security (least privilege).
3) Plugins should enrich *context packs*, not bypass governance.
4) Plugins should not require schema changes for every new integration.

---

## 10.2 Plugin categories

### A) Context providers
Add information to `cortex.get_context_pack`:
- code intelligence signals
- repo metadata
- external knowledge references

### B) Ingestion sources
Create observations from external systems:
- CI results
- backtest pipelines
- research scrapers
- monitoring/alerts

### C) Routing helpers
Map workspace → default subcortex/thread/task:
- based on repo name
- based on branch naming
- based on directory structure

### D) Policy modules
Additional redaction/secret scanning and sensitivity enforcement.

---

## 10.3 Coldstart integration (recommended plugin)

Coldstart is a local codebase intelligence sidecar.
Cortex should not re-implement it; instead integrate.

### 10.3.1 What the Coldstart plugin does
When the plugin is enabled:

1) **Enrich context packs for code subjects**
- If `subject.code_link` provided (repo + file path / symbol):
  - call Coldstart to retrieve dependencies/dependents and risk assessment
  - include these as “code context” in the pack

2) **Attach code links automatically**
- If the interactive session touches a file (git diff, file write):
  - add code links to observations/drafts

3) **Bring Cortex memory into code edits**
- When an agent requests Coldstart context for a file:
  - sidecar also searches Cortex for artifacts linked to that file/symbol
  - return combined result (code risk + institutional memory)

### 10.3.2 Why this is high leverage
It produces compounding “memory attached to code”:
- runbooks linked to scripts
- decisions linked to modules
- known gotchas linked to fragile areas

Over time, new agents inherit institutional knowledge automatically.

---

## 10.4 Git integration (optional)

### 10.4.1 Commit/branch events
The sidecar can observe:
- git commit creation
- branch switches
- large rebase warnings

These can:
- trigger context pack refresh
- create observations (“commit created: summary…”)
- warn about stale workspace cache

### 10.4.2 PR integration (server-side)
If integrating with GitHub/GitLab:
- on PR opened/merged:
  - create observation and link to task/thread
  - optionally propose artifact update (runbook/spec)

---

## 10.5 CI and data pipeline integrations (recommended eventually)

Common events:
- tests complete
- deployment succeeded/failed
- backtest run completed
- training run completed

Each should create:
- observation (summary + metrics)
- attachment links (logs)
- optional task update or thread comment draft

**Rationale:** pipeline outputs are high-value evidence.

---

## 10.6 External knowledge sources (optional)

Examples:
- Notion / Google Docs
- Slack threads
- Email summaries

Strategy:
- ingest as observations with source links
- promote into artifacts only when curated

**Rationale:** avoid dumping entire external systems into Cortex; keep it curated.

---

## 10.7 Plugin interface sketch (engineering guidance)

A plugin can register:

- `on_start(ctx)`
- `on_periodic(ctx)`
- `on_stop(ctx)`
- `enrich_context_pack(input, partial_pack) -> partial_pack`
- `preflight_upload(text_or_bytes) -> {allowed, redactions, warnings}`

Plugins should declare:
- required permissions (filesystem, network, etc.)
- configuration schema
- deterministic behavior (no hidden side effects)
