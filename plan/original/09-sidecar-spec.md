# 09 — Sidecar Specification (`cortexd`)

The sidecar is the primary enabler of “agent-first” Cortex.

It is responsible for:
- running an MCP server (for local agents),
- maintaining a local cache,
- providing stop hooks and auto-observation capture,
- buffering writes offline,
- enforcing local privacy policies (secret scanning/redaction),
- and reducing integration friction via auto `.mcp.json` and `.gitignore` updates.

---

## 9.1 Sidecar goals

1) **One command start** (`cortex start`) makes Cortex “always-on” in a workspace.
2) **Low latency**: serve most reads from local cache.
3) **Offline tolerance**: never block an interactive session; queue writes.
4) **Safe automation**: auto actions are observation-first and draft-first.
5) **Correct routing**: avoid mis-posts; prefer drafts when ambiguous.
6) **Privacy controls**: do not upload secrets; allow local-only notes.

---

## 9.2 Processes and binaries

### CLI
- `cortex` — user-facing command line

### Daemon
- `cortexd` — long-running local process:
  - sync engine
  - local cache
  - MCP server
  - hook runner
  - plugin host

`cortex start` launches `cortexd` and returns status; it should not require manual daemon management.

---

## 9.3 Local filesystem layout

In each workspace (repo), maintain:

```
.cortex/
  config.json           # workspace config (routing, policies)
  cache.db              # SQLite cache
  queue.jsonl           # offline write queue
  session_state.json    # last sync cursors, last commit ids
  drafts/               # optional local draft staging
  logs/                 # optional
```

### 9.3.1 Workspace config (`.cortex/config.json`)
Recommended fields:
- `default_subcortex_slug`
- `default_thread_id` (optional)
- `default_task_id` (optional)
- `sensitivity_mode`: normal|sensitive (affects auto actions)
- `auto_observations`: true/false
- `auto_flush_interval_minutes`
- `stop_hook_policy`: draft_only|allow_autopost
- `plugins`: list and config blocks

**Routing invariant:** if no default subcortex can be determined, auto actions must create drafts only.

---

## 9.4 MCP server (sidecar)

### 9.4.1 Transport
- stdio MCP server (most compatible)

### 9.4.2 Tool implementation model
Tools call:
- local cache for reads (fast path)
- Cortex Core for cache misses or stale items
- local queue for writes (never block)

---

## 9.5 Local cache database (SQLite)

### 9.5.1 Why SQLite
- simple, single-file, durable
- strong local performance
- easy to inspect for debugging
- supports WAL mode for concurrency

### 9.5.2 What to cache (minimum)
- subcortex list + charters + pins
- artifacts metadata + summaries (+ bodies for pinned items)
- subscribed threads summary/deltas
- recent search results and IDs
- local principal identity and permissions snapshot
- last sync cursors

### 9.5.3 Cache invalidation
- time-based TTL for volatile objects
- event-based invalidation via `/sync/deltas` endpoint
- manual `cortex sync`

---

## 9.6 Sync engine

### 9.6.1 Bootstrapping
On first start:
1) authenticate (PAT/agent key)
2) fetch `/sync/bootstrap`
3) populate cache
4) write `.mcp.json` + `.gitignore` updates (unless opt-out)
5) start MCP server and hooks

### 9.6.2 Delta sync
On interval:
- call `/sync/deltas?since=<cursor>`
- update cache entries
- update last cursor

### 9.6.3 Write flush
Flush loop:
- dequeue queue items in order
- POST to core with idempotency keys
- on success: mark committed
- on failure: retry with backoff

**Never drop writes silently.** Store failures with reason.

---

## 9.7 Offline queue

### 9.7.1 Queue format
JSON Lines (`queue.jsonl`), each line:
- `idempotency_key`
- `endpoint` or `action_type`
- `payload`
- `created_at`
- `attempts`
- `last_error`

### 9.7.2 Ordering
Preserve ordering within a commit where possible:
- observations first
- then drafts
- then task updates

---

## 9.8 Hook system (stop hooks and watchers)

### 9.8.1 Hook types
- start hook
- periodic micro-sync hook
- tool/event hook (tests ran, commit created, etc.)
- stop hook (pre-compaction/end)

### 9.8.2 Stop hook policy
Default:
- flush observations (publish)
- create drafts (checkpoint + artifact proposals)
- do not auto-post comments unless explicitly enabled

### 9.8.3 Integration points
Different environments provide different signals.
Implement:
- wrapper scripts (recommended)
- optional IDE plugin hooks
- manual CLI triggers as fallback:
  - `cortex checkpoint`
  - `cortex publish`

---

## 9.9 Auto `.mcp.json` writing (critical adoption feature)

### 9.9.1 Behavior
On `cortex start`, if a git repo root is detected:
- write or merge `.mcp.json` at repo root:
  - add `"cortex"` server entry pointing to `cortexd` executable
  - preserve existing servers
- update `.gitignore` to include:
  - `.cortex/`
  - `.mcp.json`
  - any local-only settings files

### 9.9.2 Merge rules
- never overwrite unrelated keys
- if `"cortex"` already exists, verify it matches expected; warn if mismatch

**Rationale:** eliminates manual setup and prevents accidental commits.

---

## 9.10 Secret scanning and redaction

### 9.10.1 Pre-flight checks
Before uploading any content, the sidecar runs:
- secret pattern scans (API keys, tokens)
- optional PII heuristics (email, phone) in sensitive workspaces

### 9.10.2 Redaction actions
If secrets are detected:
- block upload by default
- provide options:
  - redact inline (replace with `***`)
  - mark as sensitive and draft-only
  - keep local-only (do not upload)

**Rationale:** avoids turning Cortex into a secret leakage system.

---

## 9.11 Plugin host (integrations)

`cortexd` loads plugins that can:
- enrich context packs
- attach code links
- read external signals (git, CI)
- provide additional MCP tools (namespaced)

Plugins run with least privilege and can be disabled per workspace.

---

## 9.12 Observability and debugging

`cortex status` should show:
- server connection
- last sync time
- cache DB size
- queue length + oldest pending item age
- last errors
- enabled plugins

Logs:
- local logs in `.cortex/logs/` (optional)
- debug flag prints tool request/response summaries (without leaking secrets)
